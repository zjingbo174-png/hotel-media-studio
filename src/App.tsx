import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { PlanPage } from './pages/PlanPage';
import { HistoryPage } from './pages/HistoryPage';
import { InspirationPage } from './pages/InspirationPage';
import { HotspotPage } from './pages/HotspotPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { usePlanStore } from './store/plan';
import { useContentStore } from './store/content';
import { useSettingsStore } from './store/settings';
import { useSessionStore } from './store/session';
import { heartbeat } from './lib/api';
import { todayKey } from './lib/clock';
import { toast } from './components/Toast';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HMS] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[520px] px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-ink">页面出了点问题</p>
          <p className="muted mt-2 break-all">{this.state.error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const loadPlan = usePlanStore((s) => s.load);
  const loadContent = useContentStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const hydrate = useSessionStore((s) => s.hydrate);
  const mode = useSessionStore((s) => s.session?.mode);

  useEffect(() => {
    hydrate();
    void (async () => {
      await loadSettings();
      await loadPlan();
      await loadContent();
    })();
  }, [hydrate, loadSettings, loadPlan, loadContent]);

  // 跨天自动切换清单（应用一直开着的情况）
  useEffect(() => {
    const timer = window.setInterval(() => {
      const planDate = usePlanStore.getState().date;
      if (planDate !== todayKey()) void usePlanStore.getState().load();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (usePlanStore.getState().date !== todayKey()) void usePlanStore.getState().load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 在线/离线状态提示
  useEffect(() => {
    const onOffline = () => toast.danger('网络已断开，在线协作模式下的改动暂时无法保存');
    const onOnline = () => toast.success('网络已恢复');
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (/Failed to fetch|NetworkError/i.test(message)) toast.danger('网络请求失败，请稍后重试');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // 在线模式：每 30 秒心跳，维持在线状态；回到前台时同步别人的刷新与内容库
  useEffect(() => {
    if (mode !== 'online') return;
    void heartbeat().catch(() => {});
    const timer = window.setInterval(() => {
      void heartbeat().catch(() => {});
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void useContentStore.getState().syncBatches();
      void useContentStore.getState().reloadSaved();
    };
    document.addEventListener('visibilitychange', onVisible);
    const syncTimer = window.setInterval(() => void useContentStore.getState().syncBatches(), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode]);

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/plan" replace />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/plan/history" element={<HistoryPage />} />
            <Route path="/inspiration" element={<InspirationPage />} />
            <Route path="/hotspot" element={<HotspotPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/plan" replace />} />
          </Route>
        </Routes>
        <Onboarding />
      </HashRouter>
    </ErrorBoundary>
  );
}
