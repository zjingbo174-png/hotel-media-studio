import { create } from 'zustand';
import { useEffect } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  tone: 'default' | 'success' | 'danger';
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, opts?: { action?: ToastAction; tone?: ToastItem['tone'] }) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  items: [],
  push(message, opts) {
    const id = ++counter;
    const item: ToastItem = { id, message, action: opts?.action, tone: opts?.tone ?? 'default' };
    set({ items: [...get().items, item] });
    window.setTimeout(() => {
      set({ items: get().items.filter((i) => i.id !== id) });
    }, opts?.action ? 6000 : 2600);
  },
  dismiss(id) {
    set({ items: get().items.filter((i) => i.id !== id) });
  },
}));

export const toast = {
  show: (message: string, opts?: { action?: ToastAction; tone?: ToastItem['tone'] }) =>
    useToastStore.getState().push(message, opts),
  success: (message: string) => useToastStore.getState().push(message, { tone: 'success' }),
  danger: (message: string) => useToastStore.getState().push(message, { tone: 'danger' }),
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 safe-b"
      role="status"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto flex w-full max-w-[420px] animate-rise-in items-center gap-3 rounded-2xl bg-ink/95 px-4 py-3 text-sm text-white shadow-float backdrop-blur"
        >
          <span className="flex-1 leading-snug">{item.message}</span>
          {item.action ? (
            <button
              type="button"
              className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[13px] font-medium text-white"
              onClick={() => {
                item.action?.onClick();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
