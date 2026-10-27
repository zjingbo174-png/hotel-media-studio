import { create } from 'zustand';
import type { Settings } from '../types';
import * as data from '../lib/data';
import { DEFAULT_SETTINGS } from '../lib/data';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    try {
      const settings = await data.getSettings();
      set({ settings, loaded: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, loaded: true });
    }
  },

  async save(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await data.putSettings(next);
  },
}));
