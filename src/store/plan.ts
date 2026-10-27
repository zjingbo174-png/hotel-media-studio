import { create } from 'zustand';
import type { Task, TaskTemplate } from '../types';
import { todayKey } from '../lib/clock';
import * as data from '../lib/data';

interface AddTaskInput {
  title: string;
  note?: string;
  isTemplate?: boolean;
}

interface PlanState {
  date: string;
  tasks: Task[];
  templates: TaskTemplate[];
  loading: boolean;
  error: string | null;
  lastDeleted: Task | null;
  load: (date?: string) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  add: (input: AddTaskInput) => Promise<void>;
  update: (id: string, patch: Partial<Pick<Task, 'title' | 'note'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restoreLast: () => Promise<void>;
  clearLastDeleted: () => void;
  setTemplateActive: (id: string, active: boolean) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const usePlanStore = create<PlanState>()((set, get) => ({
  date: todayKey(),
  tasks: [],
  templates: [],
  loading: true,
  error: null,
  lastDeleted: null,

  async load(date) {
    const target = date ?? todayKey();
    set({ loading: true, error: null });
    try {
      await data.bootstrap(target);
      const [tasks, templates] = await Promise.all([data.getTasksByDate(target), data.getTemplates()]);
      set({ date: target, tasks, templates, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : '清单加载失败' });
    }
  },

  async toggle(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const next: Task = { ...task, done: !task.done, doneAt: !task.done ? Date.now() : null };
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? next : t)) });
    try {
      await data.putTask(next);
    } catch (err) {
      set({ tasks: prev, error: err instanceof Error ? err.message : '打卡失败，请重试' });
    }
  },

  async add({ title, note = '', isTemplate = false }) {
    const { date, tasks } = get();
    const trimmed = title.trim();
    if (!trimmed) return;
    const task: Task = {
      id: `${date}:${uid()}`,
      date,
      title: trimmed,
      note: note.trim(),
      done: false,
      doneAt: null,
      isTemplate,
      order: tasks.length,
      createdAt: Date.now(),
    };
    await data.putTask(task);
    if (isTemplate) {
      const tpl: TaskTemplate = {
        id: `tpl-${uid()}`,
        title: trimmed,
        note: note.trim(),
        order: get().templates.length,
        active: true,
      };
      await data.putTemplate(tpl);
      set({ templates: [...get().templates, tpl] });
    }
    set({ tasks: [...tasks, task] });
  },

  async update(id, patch) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const next = { ...task, ...patch };
    await data.putTask(next);
    set({ tasks: get().tasks.map((t) => (t.id === id ? next : t)) });
  },

  async remove(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await data.deleteTask(id);
    set({ tasks: get().tasks.filter((t) => t.id !== id), lastDeleted: task });
  },

  async restoreLast() {
    const task = get().lastDeleted;
    if (!task) return;
    await data.putTask(task);
    set({
      tasks: [...get().tasks.filter((t) => t.id !== task.id), task].sort((a, b) => a.order - b.order),
      lastDeleted: null,
    });
  },

  clearLastDeleted() {
    set({ lastDeleted: null });
  },

  async setTemplateActive(id, active) {
    const tpl = get().templates.find((t) => t.id === id);
    if (!tpl) return;
    const next = { ...tpl, active };
    await data.putTemplate(next);
    set({ templates: get().templates.map((t) => (t.id === id ? next : t)) });
  },

  async removeTemplate(id) {
    await data.deleteTemplate(id);
    set({ templates: get().templates.filter((t) => t.id !== id) });
  },
}));
