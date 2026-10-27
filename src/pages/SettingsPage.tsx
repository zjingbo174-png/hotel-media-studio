import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ui';
import { IconBell, IconChevronLeft, IconDownload, IconUpload, IconRefresh } from '../components/icons';
import { toast } from '../components/Toast';
import { useSettingsStore } from '../store/settings';
import { usePlanStore } from '../store/plan';
import { useContentStore } from '../store/content';
import { useSessionStore, DEFAULT_API_BASE } from '../store/session';
import * as data from '../lib/data';
import * as api from '../lib/api';
import { getSource } from '../lib/source';
import { cn } from '../lib/format';

function Section({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="card mb-3 overflow-hidden">
      <h2 className="flex items-center justify-between border-b border-line/70 px-4 py-2.5 text-[12px] font-medium tracking-wide text-ink-mute">
        {title}
        {extra}
      </h2>
      <div className="divide-y divide-line/70">{children}</div>
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-ink">{title}</p>
        {desc ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-mute">{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-mute/60 focus:border-clay-300 focus:ring-4 focus:ring-clay-50';

function TeamSection() {
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const [apiBase, setApiBase] = useState(session?.apiBase || DEFAULT_API_BASE);
  const [code, setCode] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [nickname, setNickname] = useState(session?.nickname || '');
  const [busy, setBusy] = useState<'' | 'join' | 'create' | 'leave' | 'probe'>('');
  const [error, setError] = useState('');
  const [me, setMe] = useState<api.MeResponse | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const online = session?.mode === 'online';

  const refreshMe = useCallback(async () => {
    if (!online) return;
    try {
      setMe(await api.getMe());
    } catch {
      /* 网络波动时静默 */
    }
  }, [online]);

  useEffect(() => {
    void refreshMe();
    if (!online) return;
    const timer = window.setInterval(() => void refreshMe(), 30_000);
    return () => window.clearInterval(timer);
  }, [online, refreshMe]);

  const normalizeBase = (value: string) => value.trim().replace(/\/+$/, '');

  const probe = async () => {
    const base = normalizeBase(apiBase);
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new Error('服务地址格式不正确，例如 https://hms-api.xxx.workers.dev');
    }
    const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocal) {
      throw new Error('协作服务地址必须是 https://（本机调试可用 http://127.0.0.1）');
    }
    await api.health(base);
    return base;
  };

  const join = async () => {
    setError('');
    if (!code.trim() || !nickname.trim()) {
      setError('请填写工作区码和昵称');
      return;
    }
    setBusy('join');
    try {
      const base = await probe();
      const res = await api.joinWorkspace(code.trim().toUpperCase(), nickname.trim(), base);
      setSession({
        mode: 'online',
        apiBase: base,
        code: res.code,
        memberId: res.memberId,
        nickname: res.nickname,
        token: res.token,
        workspaceName: res.workspaceName,
      });
      toast.success('已加入工作区，正在刷新数据');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败');
    } finally {
      setBusy('');
    }
  };

  const create = async () => {
    setError('');
    if (!nickname.trim()) {
      setError('请填写昵称');
      return;
    }
    setBusy('create');
    try {
      const base = await probe();
      const workspace = await api.createWorkspace(workspaceName.trim() || `${nickname.trim()}的工作区`, base);
      const res = await api.joinWorkspace(workspace.code, nickname.trim(), base);
      setSession({
        mode: 'online',
        apiBase: base,
        code: res.code,
        memberId: res.memberId,
        nickname: res.nickname,
        token: res.token,
        workspaceName: res.workspaceName,
      });
      toast.success(`工作区已创建，工作区码 ${workspace.code}`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy('');
    }
  };

  const leave = async () => {
    setConfirmLeave(false);
    setBusy('leave');
    try {
      await data.leaveWorkspace();
    } catch {
      /* 服务不可用也允许退出本地会话 */
    }
    setSession({ mode: 'local', apiBase: '', code: '', memberId: '', nickname: '', token: '', workspaceName: '' });
    toast.success('已退出工作区并切回本地模式');
    window.setTimeout(() => window.location.reload(), 500);
  };

  if (online && session) {
    const members = me?.members ?? [];
    return (
      <Section
        title="团队协作"
        extra={
          <button type="button" onClick={() => void refreshMe()} className="flex items-center gap-1 text-[11px] text-clay-600">
            <IconRefresh width={12} height={12} />
            刷新
          </button>
        }
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-ink">{session.workspaceName}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-mute">
                工作区码 <span className="font-mono tracking-wider text-ink-soft">{session.code}</span> · 我是 {session.nickname}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-jade-50 px-2.5 py-1 text-[11px] text-jade-600 ring-1 ring-jade-100">
              在线 {me?.onlineCount ?? 1} 人
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span
                key={m.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ring-1',
                  m.online ? 'bg-white text-ink-soft ring-line' : 'bg-paper text-ink-mute ring-line/60',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', m.online ? 'bg-jade-500' : 'bg-line')} />
                {m.nickname}
                {m.id === session.memberId ? '（我）' : ''}
              </span>
            ))}
            {members.length === 0 ? <span className="text-[11.5px] text-ink-mute">成员加载中…</span> : null}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
            内容库（收藏 / 已用）全组共享；每日清单与打卡每人独立。把工作区码和网址发给同事即可加入。
          </p>
        </div>
        <Row title="退出工作区" desc="会从服务器移除你的任务与模板，其他人不受影响。">
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            disabled={busy === 'leave'}
            className="btn bg-white px-3 py-1.5 text-[12px] text-clay-600 ring-1 ring-clay-100"
          >
            退出
          </button>
        </Row>
        <ConfirmDialog
          open={confirmLeave}
          title="退出工作区？"
          desc="退出后切回本地模式。服务器上你的任务与打卡记录会被删除，内容库保留给其他成员。"
          confirmText="退出"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => void leave()}
        />
        {error ? <p className="px-4 py-2 text-[12px] text-clay-700">{error}</p> : null}
      </Section>
    );
  }

  return (
    <Section title="团队协作（10 人内，无需密码）">
      <div className="space-y-3 px-4 py-3">
        <p className="text-[11.5px] leading-relaxed text-ink-mute">
          默认本地模式：数据只存这台设备。想和同事一起用，填一个协作服务地址，用「工作区码 + 昵称」加入即可，没有密码。
        </p>
        <label className="block">
          <span className="label">协作服务地址</span>
          <input
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="https://hms-api.你的子域.workers.dev"
            className={inputClass}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>

        <label className="block">
          <span className="label">工作区码</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例如 K7M2QX"
            maxLength={6}
            className={cn(inputClass, 'font-mono tracking-[0.3em] uppercase')}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <label className="block">
          <span className="label">我的昵称</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="同事怎么称呼你，如：前台小满"
            maxLength={16}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="label">工作区名（新建时选填）</span>
          <input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="如：前厅创作组"
            maxLength={24}
            className={inputClass}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void join()}
            disabled={busy !== ''}
            className="btn-primary flex-1"
          >
            {busy === 'join' ? '加入中…' : '加入工作区'}
          </button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy !== ''}
            className="btn-ghost flex-1"
          >
            {busy === 'create' ? '创建中…' : '新建工作区'}
          </button>
        </div>

        {error ? (
          <p className="rounded-lg bg-clay-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-clay-700">{error}</p>
        ) : null}

        <div className="rounded-xl bg-paper px-3 py-2.5 text-[11px] leading-relaxed text-ink-mute">
          <p className="font-medium text-ink-soft">新建工作区说明</p>
          <p className="mt-1">
            没有工作区码时，先填昵称点「新建工作区」，系统会生成一个 6 位码；把码发给同事，他们用同一个服务地址 + 码加入即可。工作区名默认用「昵称的工作区」。
          </p>
        </div>
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const loadPlan = usePlanStore((s) => s.load);
  const loadContent = useContentStore((s) => s.load);
  const session = useSessionStore((s) => s.session);
  const online = session?.mode === 'online';
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifyState, setNotifyState] = useState('default');

  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifyState(Notification.permission);
  }, []);

  const source = getSource(settings.dataSource);

  const exportData = async () => {
    const payload = await data.exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `酒店自媒体创作工作台-备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('备份已导出');
  };

  const importData = async (file: File) => {
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('备份文件超过 8MB，已拒绝导入');
      const text = await file.text();
      const result = await data.importBackup(JSON.parse(text));
      await Promise.all([loadPlan(), loadContent()]);
      toast.success(`已导入 ${result.tasks} 条任务、${result.saved} 条收藏`);
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : '导入失败，请检查文件格式');
    }
  };

  const askNotify = async () => {
    if (typeof Notification === 'undefined') {
      toast.danger('当前浏览器不支持系统通知');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifyState(permission);
    if (permission === 'granted') {
      await save({ browserNotify: true });
      toast.success('已开启浏览器通知');
    } else {
      await save({ browserNotify: false });
      toast.danger('未获得通知权限，提醒只在应用内显示');
    }
  };

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="设置"
        sub={online ? `在线协作 · ${session?.workspaceName}` : '本地模式 · 数据只存本机'}
        actions={
          <Link
            to="/plan"
            className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-[12.5px] text-ink-soft ring-1 ring-line"
          >
            <IconChevronLeft width={15} height={15} />
            返回
          </Link>
        }
      />

      <TeamSection />

      <Section title="打卡提醒">
        <Row
          title="下班前提醒"
          desc="到点后若当天还有未完成任务，应用内会显示提醒条；应用完全关闭时无法推送（纯前端限制）。"
        >
          <input
            type="time"
            value={settings.reminderTime ?? ''}
            onChange={(e) => void save({ reminderTime: e.target.value || null })}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-clay-300"
          />
        </Row>
        <Row
          title="浏览器通知"
          desc={notifyState === 'granted' ? '已授权，应用打开时到点会弹系统通知。' : '需要你授权；仅在应用打开或后台运行时有效。'}
        >
          <button
            type="button"
            onClick={() => void askNotify()}
            className={cn(
              'btn px-3 py-1.5 text-[12px]',
              settings.browserNotify && notifyState === 'granted' ? 'bg-jade-500 text-white' : 'bg-white ring-1 ring-line',
            )}
          >
            <IconBell width={14} height={14} />
            {notifyState === 'granted' ? '已开启' : '开启'}
          </button>
        </Row>
      </Section>

      <Section title="导航样式">
        <Row title="左侧纵向导航" desc="默认形态，符合工作台定位；手机竖屏为窄图标栏。">
          <button
            type="button"
            onClick={() => void save({ navStyle: 'side' })}
            className={cn('chip', settings.navStyle === 'side' ? 'chip-on' : 'bg-white text-ink-soft')}
          >
            左侧栏
          </button>
        </Row>
        <Row title="底部 Tab" desc="拇指更容易点到，内容区更宽；同样 3 个主入口。">
          <button
            type="button"
            onClick={() => void save({ navStyle: 'bottom' })}
            className={cn('chip', settings.navStyle === 'bottom' ? 'chip-on' : 'bg-white text-ink-soft')}
          >
            底部栏
          </button>
        </Row>
      </Section>

      <Section title="数据源">
        <Row title={source.label} desc={source.capabilities.note}>
          <span className="rounded-full bg-clay-50 px-2 py-0.5 text-[10.5px] text-clay-600">演示</span>
        </Row>
        <Row title="接入真实数据" desc="V2 计划：粘贴链接半自动解析，或接入第三方数据服务；接口已按 ContentSource 预留。">
          <span className="text-[11px] text-ink-mute">V2</span>
        </Row>
      </Section>

      <Section title="数据管理">
        <Row title="导出备份" desc={online ? '导出我的任务与工作区内容库为 JSON。' : '把任务、收藏、设置导出为 JSON 文件（建议每周一次）。'}>
          <button type="button" onClick={() => void exportData()} className="btn bg-white px-3 py-1.5 text-[12px] ring-1 ring-line">
            <IconDownload width={14} height={14} />
            导出
          </button>
        </Row>
        {!online ? (
          <>
            <Row title="导入恢复" desc="选择之前导出的 JSON 文件，恢复本机数据（会覆盖现有记录）。">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn bg-white px-3 py-1.5 text-[12px] ring-1 ring-line">
                <IconUpload width={14} height={14} />
                导入
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importData(file);
                  e.target.value = '';
                }}
              />
            </Row>
            <Row title="清空全部数据" desc="删除本机所有任务、收藏与设置，不可恢复。">
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="btn bg-white px-3 py-1.5 text-[12px] text-clay-600 ring-1 ring-clay-100"
              >
                清空
              </button>
            </Row>
          </>
        ) : (
          <Row title="导入备份" desc="在线模式下不支持覆盖导入，避免把别人的数据覆盖掉；请退出工作区后用本地模式导入。" />
        )}
      </Section>

      <Section title="关于">
        <Row title="版本" desc="v0.2.0 · 支持在线协作（工作区码 + 昵称，无密码）">
          <span className="text-[11px] text-ink-mute">MIT</span>
        </Row>
        <div className="px-4 py-3 text-[11.5px] leading-relaxed text-ink-mute">
          <p className="mb-1 font-medium text-ink-soft">免责声明</p>
          <p>
            本工具为个人创作辅助工具，与抖音、小红书等平台无任何关联，不代表平台立场。当前内置数据为虚构演示内容，账号、数据、标题均非真实；「查看原内容」跳转平台搜索结果页，不缓存、不转存任何第三方内容。二创请自行实拍，遵守平台规则与著作权规定。
          </p>
        </div>
      </Section>

      <p className="pb-4 text-center text-[11px] text-ink-mute/70">
        {online ? '数据保存在团队协作服务，任务按成员隔离' : '数据只保存在本机浏览器，不上传服务器'}
      </p>

      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据？"
        desc="任务、打卡记录、收藏与设置都会被删除，且无法恢复。建议先导出备份。"
        confirmText="清空"
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          await data.clearAll();
          setConfirmClear(false);
          toast.success('已清空，正在重新初始化');
          await Promise.all([loadPlan(), loadContent()]);
        }}
      />
    </div>
  );
}
