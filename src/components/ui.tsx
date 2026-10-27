import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  children,
}: {
  /** 0-1，null 表示无任务 */
  value: number | null;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eee6d9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 1 ? '#3f7a5e' : '#e0573b'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-ink-mute">{icon}</div> : null}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {desc ? <p className="muted max-w-[260px]">{desc}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card animate-pulse overflow-hidden">
      <div className="flex gap-3 p-4">
        <div className="h-20 w-16 shrink-0 rounded-xl bg-line/70" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3.5 w-3/4 rounded bg-line/70" />
          <div className="h-3 w-1/2 rounded bg-line/50" />
          <div className="h-3 w-2/3 rounded bg-line/40" />
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  desc,
  confirmText = '确定',
  tone = 'danger',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  desc?: string;
  confirmText?: string;
  tone?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center px-8">
      <button type="button" aria-label="取消" className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative w-full max-w-[340px] animate-rise-in rounded-2xl bg-card p-5 shadow-float">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        {desc ? <p className="muted mt-1.5">{desc}</p> : null}
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={
              tone === 'danger'
                ? 'btn flex-1 bg-clay-600 text-white hover:bg-clay-700'
                : 'btn-primary flex-1'
            }
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
