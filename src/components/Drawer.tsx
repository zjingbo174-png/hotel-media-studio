import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { cn } from '../lib/format';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  headerExtra?: ReactNode;
  /** 底部固定操作区 */
  footer?: ReactNode;
}

/** 全屏底部抽屉：移动端主详情容器。下拉关闭仅从把手区域起手，避免与列表滚动冲突。 */
export function Drawer({ open, onClose, title, subtitle, children, headerExtra, footer }: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // 用 Portal 挂到 body：避免祖先元素的 transform（页面入场动画）把 fixed 定位变成相对定位
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92dvh] w-full max-w-[680px] animate-sheet-up flex-col rounded-t-[28px] bg-paper shadow-float safe-b"
      >
        {/* 下拉关闭只认把手区域，避免详情内容向下滚动时误关 */}
        <div
          className="flex shrink-0 justify-center px-4 pb-1 pt-2"
          onTouchStart={(e) => {
            const startY = e.touches[0].clientY;
            const onMove = (ev: TouchEvent) => {
              if (ev.touches[0].clientY - startY > 90) {
                window.removeEventListener('touchmove', onMove);
                onClose();
              }
            };
            window.addEventListener('touchmove', onMove, { passive: true });
            window.addEventListener('touchend', () => window.removeEventListener('touchmove', onMove), {
              once: true,
            });
          }}
        >
          <div className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
        </div>
        <header className="sticky top-0 z-10 shrink-0 bg-paper/95 px-5 pb-3 pt-3 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-snug text-ink">{title}</h2>
              {subtitle ? <div className="muted mt-1">{subtitle}</div> : null}
            </div>
            {headerExtra}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink-soft ring-1 ring-line focus-visible:ring-2 focus-visible:ring-clay-400"
            >
              <IconX width={18} height={18} />
            </button>
          </div>
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5', footer ? 'pb-4' : 'pb-8')}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
