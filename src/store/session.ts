import { create } from 'zustand';

export type Mode = 'local' | 'online';

export interface Session {
  mode: Mode;
  /** 后端服务地址，如 https://hms-api.xxx.workers.dev */
  apiBase: string;
  code: string;
  memberId: string;
  nickname: string;
  token: string;
  workspaceName: string;
}

const KEY = 'hms-session-v1';

/** 默认 API 地址：构建时注入 > 本地开发默认端口 */
export const DEFAULT_API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed || (parsed.mode !== 'local' && parsed.mode !== 'online')) return null;
    if (parsed.mode === 'online' && (!parsed.token || !parsed.apiBase)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(session: Session | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式下忽略 */
  }
}

interface SessionState {
  session: Session | null;
  ready: boolean;
  hydrate: () => void;
  setSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: read(),
  ready: false,
  hydrate: () => set({ session: read(), ready: true }),
  setSession: (session) => {
    write(session);
    set({ session });
  },
}));

/** 非 React 环境（数据层）读取当前会话 */
export function getSession(): Session | null {
  return useSessionStore.getState().session;
}

export function isOnline(): boolean {
  return getSession()?.mode === 'online';
}
