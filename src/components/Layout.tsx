import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../store/settings';
import { useSessionStore } from '../store/session';
import { useContentStore } from '../store/content';
import { cn } from '../lib/format';
import { IconBulb, IconCheckSquare, IconFlame, IconGear } from './icons';
import { ReminderBanner } from './ReminderBanner';
import { ToastHost } from './Toast';

const NAV_ITEMS = [
  { to: '/plan', label: '每日计划', short: '计划', icon: IconCheckSquare },
  { to: '/inspiration', label: '选题灵感', short: '选题', icon: IconBulb },
  { to: '/hotspot', label: '爆款热点/二创', short: '热点', icon: IconFlame },
];

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact && 'flex-col gap-1')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-clay-400 to-clay-600 text-[15px] font-semibold text-white shadow-sm">
        创
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">酒店自媒体</span>
          <span className="block truncate text-[11px] leading-tight text-ink-mute">创作工作台</span>
        </span>
      ) : null}
    </div>
  );
}

export function Layout() {
  const navStyle = useSettingsStore((s) => s.settings.navStyle);
  const online = useSessionStore((s) => s.session?.mode === 'online');
  const { pathname } = useLocation();

  // 在线协作：切页时同步别人的刷新与内容库（含从后台切回）
  useEffect(() => {
    if (!online) return;
    void useContentStore.getState().syncBatches();
    void useContentStore.getState().reloadSaved();
  }, [online, pathname]);

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      {navStyle === 'side' ? (
        <nav
          aria-label="主导航"
          className="safe-t sticky top-0 z-40 flex h-[100dvh] w-[60px] shrink-0 flex-col items-center gap-1 border-r border-line bg-card/85 px-1.5 py-3 backdrop-blur md:w-[196px] md:items-stretch md:px-3"
        >
          <div className="mb-3 hidden px-1 md:block">
            <Brand />
          </div>
          <div className="mb-3 md:hidden">
            <Brand compact />
          </div>
          <div className="flex w-full flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('rail-item', isActive && 'rail-item-active', 'md:flex-row md:justify-start md:gap-2.5 md:px-3')
                }
              >
                <item.icon width={21} height={21} />
                <span className="md:text-[13px] md:font-medium">
                  <span className="md:hidden">{item.short}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </span>
              </NavLink>
            ))}
          </div>
          <div className="mt-auto w-full">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn('rail-item', isActive && 'rail-item-active', 'md:flex-row md:justify-start md:gap-2.5 md:px-3')
              }
              aria-label="设置"
            >
              <IconGear width={20} height={20} />
              <span className="md:text-[13px] md:font-medium">
                <span className="md:hidden">设置</span>
                <span className="hidden md:inline">设置</span>
              </span>
            </NavLink>
          </div>
        </nav>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={cn(
            'mx-auto w-full max-w-[760px] flex-1 px-4 pt-3 md:px-8 md:pt-6',
            navStyle === 'bottom' ? 'pb-28' : 'pb-8',
          )}
        >
          <ReminderBanner />
          <Outlet />
        </main>
      </div>

      {navStyle === 'bottom' ? (
        <nav
          aria-label="底部导航"
          className="safe-b fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-card/95 px-2 pt-1.5 backdrop-blur"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px]',
                  isActive ? 'text-clay-600' : 'text-ink-mute',
                )
              }
            >
              <item.icon width={22} height={22} />
              <span>{item.short}</span>
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px]',
                isActive ? 'text-clay-600' : 'text-ink-mute',
              )
            }
          >
            <IconGear width={22} height={22} />
            <span>设置</span>
          </NavLink>
        </nav>
      ) : null}

      <ToastHost />
    </div>
  );
}
