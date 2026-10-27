import type { Topic } from '../types';
import { Drawer } from './Drawer';
import { PlatformBadge } from './TopicCard';
import { IconBookmark, IconCopy, IconExternal, IconSpark } from './icons';
import { copyText, formatMetrics, platformSearchUrl } from '../lib/format';
import { toast } from './Toast';

const ANALYSIS_META: Array<{ key: keyof Topic['analysis']; label: string; hint: string }> = [
  { key: 'gap', label: '选题缺口', hint: '满足了什么未被满足的需求' },
  { key: 'hook', label: '文案钩子', hint: '开头 3 秒 / 标题为什么抓人' },
  { key: 'keywords', label: '关键词与话题', hint: '搜索词布局与话题借势' },
  { key: 'format', label: '形式与节奏', hint: '载体、时长、封面等可迁移结构' },
];

export function TopicDetail({
  topic,
  open,
  onClose,
  savedState,
  onToggleSaved,
  onJump,
}: {
  topic: Topic | null;
  open: boolean;
  onClose: () => void;
  savedState: 'saved' | 'used' | null;
  onToggleSaved: (status: 'saved' | 'used') => void;
  onJump: (url: string) => void;
}) {
  if (!topic) return null;
  const searchUrl = platformSearchUrl(topic.platform, topic.keywords[0] ?? topic.title);

  const copy = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast[ok ? 'success' : 'danger'](ok ? `已复制${label}` : '复制失败，请长按选择');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={topic.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={topic.platform} />
          <span>{topic.author}</span>
          <span className="text-ink-mute/60">·</span>
          <span>{topic.publishedAt}</span>
          <span className="text-ink-mute/60">·</span>
          <span>{formatMetrics(topic.metrics)}</span>
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleSaved('saved')}
            className={`btn flex-1 ${
              savedState === 'saved'
                ? 'bg-clay-500 text-white'
                : 'bg-white text-ink-soft ring-1 ring-line'
            }`}
          >
            <IconBookmark width={16} height={16} />
            {savedState === 'saved' ? '已收藏' : '收藏'}
          </button>
          <button
            type="button"
            onClick={() => onToggleSaved('used')}
            className={`btn flex-1 ${
              savedState === 'used'
                ? 'bg-jade-500 text-white'
                : 'bg-white text-ink-soft ring-1 ring-line'
            }`}
          >
            标记已用
          </button>
          <button type="button" className="btn-primary flex-[1.4]" onClick={() => onJump(searchUrl)}>
            <IconExternal width={16} height={16} />
            查看原内容
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <section className="card p-4">
          <h3 className="section-title mb-1.5">原文案</h3>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">{topic.copy}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topic.tags.map((tag) => (
              <button key={tag} type="button" onClick={() => void copy(tag, '话题')} className="chip">
                {tag}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">搜索关键词</h3>
            <button
              type="button"
              className="flex items-center gap-1 text-[11.5px] text-clay-600"
              onClick={() => void copy(topic.keywords.join(' '), '全部关键词')}
            >
              <IconCopy width={13} height={13} />
              全部复制
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topic.keywords.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => void copy(kw, '关键词')}
                className="chip bg-paper text-ink-soft"
              >
                {kw}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[14px] font-semibold text-ink">
            <IconSpark width={16} height={16} className="text-clay-500" />
            火爆核心原因
          </h3>
          <div className="space-y-2">
            {ANALYSIS_META.map((item, idx) => (
              <div key={item.key} className="card p-3.5">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-clay-50 text-[11px] font-semibold text-clay-600">
                    {idx + 1}
                  </span>
                  <span className="text-[13.5px] font-medium text-ink">{item.label}</span>
                  <span className="text-[10.5px] text-ink-mute">{item.hint}</span>
                </div>
                <p className="pl-7 text-[13px] leading-relaxed text-ink-soft">{topic.analysis[item.key]}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 px-1 text-[14px] font-semibold text-ink">原创创作思路</h3>
          <div className="space-y-3">
            {topic.ideas.map((idea, idx) => (
              <div key={`${idea.title}-${idx}`} className="card p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-jade-50 text-[11px] font-semibold text-jade-600">
                    {idx + 1}
                  </span>
                  <p className="text-[14px] font-medium leading-snug text-ink">{idea.title}</p>
                </div>
                {idea.altTitles.length > 0 ? (
                  <p className="mt-1.5 pl-7 text-[12px] text-ink-mute">备选标题：{idea.altTitles.join(' / ')}</p>
                ) : null}

                <div className="mt-2.5 space-y-1.5 pl-7">
                  <p className="text-[11px] font-medium text-ink-mute">内容结构</p>
                  <ol className="space-y-1">
                    {idea.structure.map((node, i) => (
                      <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                        <span className="text-clay-400">{i + 1}.</span>
                        <span>{node}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-2.5 space-y-1.5 pl-7">
                  <p className="text-[11px] font-medium text-ink-mute">酒店场景切入点</p>
                  <p className="text-[12.5px] leading-relaxed text-ink-soft">{idea.hotelAngle}</p>
                </div>

                <div className="mt-2.5 space-y-1 pl-7">
                  <p className="text-[11px] font-medium text-ink-mute">拍摄 / 素材清单</p>
                  <ul className="space-y-0.5">
                    {idea.shotList.map((s, i) => (
                      <li key={i} className="text-[12.5px] leading-relaxed text-ink-soft">
                        · {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-2.5 rounded-lg bg-paper px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-mute pl-2.5">
                  发布建议：{idea.publishTip}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="rounded-xl bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-ink-mute ring-1 ring-line/60">
          演示说明：本条为内置示例内容（文案自写、账号虚构）。「查看原内容」跳转的是该关键词的平台搜索结果页，不是原视频地址；接入真实数据源后会自动替换为原链接。
        </p>
      </div>
    </Drawer>
  );
}
