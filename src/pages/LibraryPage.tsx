import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog, EmptyState } from '../components/ui';
import { IconBookmark, IconChevronLeft, IconTrash } from '../components/icons';
import { TopicDetail } from '../components/TopicDetail';
import { HotspotDetail } from '../components/HotspotDetail';
import { PlatformBadge } from '../components/TopicCard';
import { toast } from '../components/Toast';
import { useContentStore } from '../store/content';
import * as data from '../lib/data';
import type { Hotspot, SavedItem, Topic } from '../types';
import { cn, openExternal } from '../lib/format';

type StatusFilter = 'all' | 'saved' | 'used';

export function LibraryPage() {
  const saved = useContentStore((s) => s.saved);
  const reloadSaved = useContentStore((s) => s.reloadSaved);
  const toggleSaved = useContentStore((s) => s.toggleSaved);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<'all' | 'topic' | 'hotspot'>('all');
  const [open, setOpen] = useState<SavedItem | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    void reloadSaved();
  }, [reloadSaved]);

  const items = useMemo(
    () =>
      saved.filter(
        (s) => (status === 'all' || s.status === status) && (kind === 'all' || s.kind === kind),
      ),
    [saved, status, kind],
  );

  const remove = async (id: string) => {
    await data.deleteSavedItem(id);
    await reloadSaved();
    setConfirmId(null);
    toast.success('已从内容库移除');
  };

  const openTopic = open?.kind === 'topic' ? (open.snapshot as Topic) : null;
  const openHotspot = open?.kind === 'hotspot' ? (open.snapshot as Hotspot) : null;

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="内容库"
        sub={`收藏与已用共 ${saved.length} 条 · 换批次也不丢`}
        actions={
          <Link
            to="/inspiration"
            className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-[12.5px] text-ink-soft ring-1 ring-line"
          >
            <IconChevronLeft width={15} height={15} />
            返回
          </Link>
        }
      />

      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'saved', label: '收藏' },
            { key: 'used', label: '已用' },
          ] as Array<{ key: StatusFilter; label: string }>
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={cn('chip', status === f.key ? 'chip-on' : 'bg-white/80 text-ink-soft')}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {(
          [
            { key: 'all', label: '全部类型' },
            { key: 'topic', label: '选题' },
            { key: 'hotspot', label: '热点' },
          ] as Array<{ key: 'all' | 'topic' | 'hotspot'; label: string }>
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={cn('chip', kind === f.key ? 'chip-on' : 'bg-white/80 text-ink-soft')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<IconBookmark width={26} height={26} />}
          title="内容库还是空的"
          desc="在选题灵感或热点详情里点「收藏 / 标记已用」，内容会沉淀到这里。"
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <div className="card flex items-start gap-3 p-3.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(item)}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <PlatformBadge platform={item.platform} />
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] ring-1',
                        item.status === 'used'
                          ? 'bg-jade-50 text-jade-600 ring-jade-100'
                          : 'bg-clay-50 text-clay-600 ring-clay-100',
                      )}
                    >
                      {item.status === 'used' ? '已用' : '收藏'}
                    </span>
                    <span className="text-[10.5px] text-ink-mute">{item.kind === 'topic' ? '选题' : '热点'}</span>
                  </div>
                  <p className="clamp-2 text-[14px] font-medium leading-snug text-ink">{item.title}</p>
                  <p className="mt-1 text-[11px] text-ink-mute">
                    {new Date(item.savedAt).toLocaleDateString('zh-CN')} 保存
                  </p>
                </button>
                <button
                  type="button"
                  aria-label="从内容库移除"
                  onClick={() => setConfirmId(item.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute/70 hover:bg-clay-50 hover:text-clay-600"
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TopicDetail
        topic={openTopic}
        open={!!openTopic}
        onClose={() => setOpen(null)}
        savedState={open?.status ?? null}
        onToggleSaved={(next) => {
          if (!openTopic) return;
          void toggleSaved('topic', openTopic, next);
          setOpen({ ...open!, status: next });
        }}
        onJump={(url) => {
          if (!openExternal(url)) toast.danger('链接不在平台白名单内，已阻止打开');
        }}
      />

      <HotspotDetail
        item={openHotspot}
        open={!!openHotspot}
        onClose={() => setOpen(null)}
        savedState={open?.status ?? null}
        onToggleSaved={(next) => {
          if (!openHotspot) return;
          void toggleSaved('hotspot', openHotspot, next);
          setOpen({ ...open!, status: next });
        }}
        onJump={(url) => {
          if (!openExternal(url)) toast.danger('链接不在平台白名单内，已阻止打开');
        }}
      />

      <ConfirmDialog
        open={!!confirmId}
        title="从内容库移除？"
        desc="只移除这条收藏记录，不影响原始批次数据。"
        confirmText="移除"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => confirmId && void remove(confirmId)}
      />
    </div>
  );
}
