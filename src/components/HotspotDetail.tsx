import { useState } from 'react';
import type { Hotspot } from '../types';
import { Drawer } from './Drawer';
import { PlatformBadge } from './TopicCard';
import { IconBookmark, IconCopy, IconExternal, IconFlame } from './icons';
import { copyText, platformSearchUrl } from '../lib/format';
import { hotspotToMarkdown, planToMarkdown } from '../lib/markdown';
import { toast } from './Toast';
import { cn } from '../lib/format';

const BREAKDOWN_META: Array<{ key: keyof Hotspot['breakdown']; label: string }> = [
  { key: 'persona', label: '人设定位' },
  { key: 'opening', label: '开头 3 秒' },
  { key: 'narrative', label: '叙事结构' },
  { key: 'audioVisual', label: '视听元素' },
  { key: 'commentHook', label: '评论区钩子' },
];

export function HotspotDetail({
  item,
  open,
  onClose,
  savedState,
  onToggleSaved,
  onJump,
}: {
  item: Hotspot | null;
  open: boolean;
  onClose: () => void;
  savedState: 'saved' | 'used' | null;
  onToggleSaved: (status: 'saved' | 'used') => void;
  onJump: (url: string) => void;
}) {
  const [planIdx, setPlanIdx] = useState(0);
  if (!item) return null;
  const plan = item.plans[planIdx] ?? item.plans[0];
  const searchUrl = platformSearchUrl(item.platform, item.title.slice(0, 12));

  const copy = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast[ok ? 'success' : 'danger'](ok ? `已复制${label}` : '复制失败，请长按选择');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={item.platform} />
          <span>
            {item.account} · {item.followers}
          </span>
          <span className="text-ink-mute/60">·</span>
          <span>{item.track}</span>
          <span className="text-ink-mute/60">·</span>
          <span>
            播放 {item.metrics.play} / 赞 {item.metrics.like}
          </span>
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleSaved('saved')}
            className={cn('btn flex-1', savedState === 'saved' ? 'bg-clay-500 text-white' : 'bg-white ring-1 ring-line')}
          >
            <IconBookmark width={16} height={16} />
            {savedState === 'saved' ? '已收藏' : '收藏'}
          </button>
          <button
            type="button"
            onClick={() => onToggleSaved('used')}
            className={cn('btn flex-1', savedState === 'used' ? 'bg-jade-500 text-white' : 'bg-white ring-1 ring-line')}
          >
            标记已用
          </button>
          <button type="button" className="btn-primary flex-[1.4]" onClick={() => onJump(searchUrl)}>
            <IconExternal width={16} height={16} />
            原爆款入口
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {item.styleTags.map((tag) => (
            <span key={tag} className="chip bg-white/80 text-ink-soft">
              {tag}
            </span>
          ))}
        </div>

        <section className="card p-4">
          <h3 className="section-title mb-2">账号风格拆解</h3>
          <dl className="space-y-2">
            {BREAKDOWN_META.map((row) => (
              <div key={row.key} className="grid grid-cols-[64px_1fr] gap-2">
                <dt className="text-[11px] leading-relaxed text-ink-mute">{row.label}</dt>
                <dd className="text-[12.5px] leading-relaxed text-ink-soft">{item.breakdown[row.key]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <div className="card p-3.5">
            <h3 className="mb-1.5 text-[13px] font-semibold text-jade-600">可复用素材点</h3>
            <ul className="space-y-1">
              {item.reusable.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  <span className="text-jade-500">·</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-3.5">
            <h3 className="mb-1.5 text-[13px] font-semibold text-clay-600">必须替换</h3>
            <ul className="space-y-1">
              {item.mustReplace.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  <span className="text-clay-400">·</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <IconFlame width={16} height={16} className="text-clay-500" />
              二创改编方案
            </h3>
            <button
              type="button"
              className="flex items-center gap-1 text-[11.5px] text-clay-600"
              onClick={() => void copy(hotspotToMarkdown(item), '整套方案')}
            >
              <IconCopy width={13} height={13} />
              复制全部
            </button>
          </div>

          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {item.plans.map((p, idx) => (
              <button
                key={p.type}
                type="button"
                onClick={() => setPlanIdx(idx)}
                className={cn('chip', idx === planIdx ? 'chip-on' : 'bg-white/80 text-ink-soft')}
              >
                {p.type} · {p.dimension}
              </button>
            ))}
          </div>

          {plan ? (
            <div className="card space-y-3 p-4">
              <div>
                <p className="text-[11px] font-medium text-ink-mute">改编思路</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{plan.concept}</p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-ink-mute">分镜大纲（6 格）</p>
                <ol className="space-y-1.5">
                  {plan.storyboard.map((shot) => (
                    <li key={shot.shot} className="rounded-xl bg-paper/80 p-2.5">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-clay-600 ring-1 ring-line">
                          镜头 {shot.shot}
                        </span>
                        <span className="text-[10.5px] text-ink-mute">{shot.duration}</span>
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-ink">
                        <span className="text-ink-mute">画面：</span>
                        {shot.visual}
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink">
                        <span className="text-ink-mute">台词：</span>
                        {shot.line}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">要点：{shot.tip}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-[11px] font-medium text-ink-mute">口播 / 字幕要点</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{plan.script}</p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-ink-mute">拍摄清单</p>
                <ul className="mt-1 space-y-0.5">
                  {plan.shotList.map((s, i) => (
                    <li key={i} className="text-[12.5px] leading-relaxed text-ink-soft">
                      · {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg bg-paper px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-soft">
                  <span className="text-ink-mute">音乐/字幕：</span>
                  {plan.bgm}
                </p>
                <p className="rounded-lg bg-paper px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-soft">
                  <span className="text-ink-mute">封面：</span>
                  {plan.cover}
                </p>
              </div>

              <p className="rounded-lg bg-jade-50/70 px-2.5 py-2 text-[11.5px] leading-relaxed text-jade-700">
                发布建议：{plan.publishTip}
              </p>
              <p className="rounded-lg bg-clay-50/80 px-2.5 py-2 text-[11.5px] leading-relaxed text-clay-700">
                去重与合规：{plan.risk}
              </p>

              <button
                type="button"
                onClick={() => void copy(planToMarkdown(item, plan), `方案 ${plan.type}`)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[12.5px] font-medium text-ink-soft ring-1 ring-line"
              >
                <IconCopy width={14} height={14} />
                复制这套方案
              </button>
            </div>
          ) : null}
        </section>

        <p className="rounded-xl bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-ink-mute ring-1 ring-line/60">
          演示说明：账号、数据与标题均为虚构示例；「原爆款入口」跳转的是该标题关键词的平台搜索结果页，接入真实数据源后替换为原链接。二创方案需自行实拍，不得搬运原片。
        </p>
      </div>
    </Drawer>
  );
}
