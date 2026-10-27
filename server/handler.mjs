/**
 * 与运行时无关的多人协作 API 核心。
 * 入参出参都是 Web Fetch API，可在 Cloudflare Worker 与 Node 中共用。
 * 所有数据库访问都通过 storage 接口，本文件不依赖 D1 / Node。
 */

const BODY_LIMIT = 256 * 1024;
const SETTINGS_LIMIT = 16 * 1024;
const SNAPSHOT_LIMIT = 64 * 1024;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_WORKSPACE_NAME = '我的工作区';
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 默认模板：两件每天都要做的事。 */
const DEFAULT_TEMPLATES = [
  { title: '离店房态价格', note: '核对当天离店房态与价格' },
  { title: '排房', note: '跟进当天排房与房态调整' },
];

const RATE_LIMITS = {
  sessions: { limit: 10, windowMs: 60 * 1000 },
  workspaces: { limit: 5, windowMs: 60 * 60 * 1000 },
  write: { limit: 120, windowMs: 60 * 1000 },
};

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = extra.retryAfter;
  }
}

const badRequest = (message) => new ApiError(400, 'BAD_REQUEST', message);
const notFound = (message = '资源不存在') => new ApiError(404, 'NOT_FOUND', message);

export function createApi({ storage, now = Date.now, env = {} } = {}) {
  if (!storage) throw new Error('createApi: 缺少 storage');

  const clock = typeof now === 'function' ? now : () => now;
  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAllOrigins = allowedOrigins.includes('*');

  /** 限流计数：内存 Map，按 IP + 固定窗口。 */
  const buckets = new Map();

  function corsHeaders(request) {
    const origin = request.headers.get('origin');
    const headers = {
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    };
    if (allowAllOrigins) headers['access-control-allow-origin'] = '*';
    else if (origin && allowedOrigins.includes(origin)) headers['access-control-allow-origin'] = origin;
    return headers;
  }

  function json(data, status = 200, cors, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...extraHeaders,
      },
    });
  }

  function consumeRate(kind, ip) {
    const conf = RATE_LIMITS[kind];
    if (!conf) return;
    const t = clock();
    const windowStart = Math.floor(t / conf.windowMs) * conf.windowMs;
    const key = `${kind}|${ip}|${windowStart}`;
    let rec = buckets.get(key);
    if (!rec) {
      if (buckets.size > 2000) {
        for (const [k, v] of buckets) if (v.expire <= t) buckets.delete(k);
      }
      rec = { count: 0, expire: windowStart + conf.windowMs };
      buckets.set(key, rec);
    }
    rec.count += 1;
    if (rec.count > conf.limit) {
      throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试', {
        retryAfter: Math.max(1, Math.ceil((windowStart + conf.windowMs - t) / 1000)),
      });
    }
  }

  async function handle(request) {
    const cors = corsHeaders(request);
    const method = String(request.method || 'GET').toUpperCase();

    // 预检请求不鉴权、不计限流
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: '请求地址不合法' } }, 400, cors);
    }
    const path = normalizePath(url.pathname);

    try {
      const ip = clientIp(request);
      if (method === 'POST' && path === '/api/sessions') consumeRate('sessions', ip);
      else if (method === 'POST' && path === '/api/workspaces') consumeRate('workspaces', ip);
      else if (method !== 'GET' && method !== 'HEAD') consumeRate('write', ip);

      /** 取当前登录成员与工作区。 */
      const auth = async () => {
        const raw = request.headers.get('authorization') || '';
        const matched = /^Bearer\s+(\S+)$/i.exec(raw.trim());
        if (!matched) throw new ApiError(401, 'UNAUTHORIZED', '缺少有效的登录凭证');
        const member = await storage.members.getByTokenHash(await sha256Hex(matched[1]));
        if (!member) throw new ApiError(401, 'UNAUTHORIZED', '登录已失效，请重新加入工作区');
        const workspace = await storage.workspaces.getById(member.workspaceId);
        if (!workspace) throw new ApiError(401, 'UNAUTHORIZED', '工作区不存在');
        return { member, workspace };
      };

      // ---------- 健康检查 ----------
      if (path === '/api/health' && method === 'GET') {
        return json({ ok: true, version: '1', time: clock() }, 200, cors);
      }

      // ---------- 工作区 ----------
      if (path === '/api/workspaces' && method === 'POST') {
        const body = (await readBody(request, { required: false })) ?? {};
        const input = asObject(body);
        let name = DEFAULT_WORKSPACE_NAME;
        const rawName = typeof input.name === 'string' ? input.name.trim() : input.name;
        if (rawName !== undefined && rawName !== null && rawName !== '') {
          name = text(input.name, '工作区名称', 24);
        }

        let code = null;
        for (let i = 0; i < 5; i += 1) {
          const candidate = randomCode();
          if (!(await storage.workspaces.getByCode(candidate))) {
            code = candidate;
            break;
          }
        }
        if (!code) throw new ApiError(409, 'CONFLICT', '工作区码生成失败，请重试');

        const workspace = {
          id: crypto.randomUUID(),
          code,
          name,
          createdAt: clock(),
        };
        await storage.workspaces.create(workspace);
        return json({ workspaceId: workspace.id, code: workspace.code, name: workspace.name }, 200, cors);
      }

      // ---------- 加入工作区 ----------
      if (path === '/api/sessions' && method === 'POST') {
        const input = asObject(await readBody(request));
        const code = text(input.code, '工作区码', 32).toUpperCase();
        const nickname = text(input.nickname, '昵称', 16, { min: 1 });
        const workspace = await storage.workspaces.getByCode(code);
        if (!workspace) throw notFound('工作区码不存在');

        const token = randomToken();
        const t = clock();
        const member = {
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          nickname,
          tokenHash: await sha256Hex(token),
          createdAt: t,
          lastSeenAt: t,
          settings: '{}',
        };
        await storage.members.create(member);
        return json(
          {
            token,
            memberId: member.id,
            workspaceId: workspace.id,
            code: workspace.code,
            nickname: member.nickname,
            workspaceName: workspace.name,
            settings: {},
          },
          200,
          cors,
        );
      }

      // ---------- 当前成员 / 心跳 ----------
      if ((path === '/api/me' || path === '/api/heartbeat') && method === 'GET') {
        const { member, workspace } = await auth();
        const t = clock();
        await storage.members.update(member.id, { lastSeenAt: t });
        const members = await storage.members.listByWorkspace(workspace.id);
        const dto = members.map((m) => ({
          id: m.id,
          nickname: m.nickname,
          lastSeenAt: m.lastSeenAt,
          online: t - m.lastSeenAt <= ONLINE_WINDOW_MS,
        }));
        return json(
          {
            me: { id: member.id, nickname: member.nickname },
            workspace: { id: workspace.id, code: workspace.code, name: workspace.name },
            members: dto,
            onlineCount: dto.filter((m) => m.online).length,
          },
          200,
          cors,
        );
      }

      // ---------- 初始化默认模板与当日清单 ----------
      if (path === '/api/seed' && method === 'POST') {
        const { member, workspace } = await auth();
        const input = asObject(await readBody(request));
        const date = requireDate(input.date);
        const t = clock();

        let tasks = await storage.tasks.listByMemberDate(member.id, date);
        let templates = await storage.templates.listByMember(member.id);

        if (tasks.length === 0 && templates.length === 0) {
          // 固定 id + 批量忽略重复，保证并发/重复调用不会多建
          const newTemplates = DEFAULT_TEMPLATES.map((item, index) => ({
            id: `seed:${member.id}:tpl:${index + 1}`,
            workspaceId: workspace.id,
            memberId: member.id,
            title: item.title,
            note: item.note,
            sortOrder: index,
            active: 1,
          }));
          const newTasks = DEFAULT_TEMPLATES.map((item, index) => ({
            id: `seed:${member.id}:${date}:task:${index + 1}`,
            workspaceId: workspace.id,
            memberId: member.id,
            date,
            title: item.title,
            note: item.note,
            done: 0,
            doneAt: null,
            isTemplate: 1,
            sortOrder: index,
            createdAt: t,
          }));
          await storage.templates.createMany(newTemplates);
          await storage.tasks.createMany(newTasks);
          tasks = await storage.tasks.listByMemberDate(member.id, date);
          templates = await storage.templates.listByMember(member.id);
        }

        return json({ tasks: tasks.map(taskDto), templates: templates.map(templateDto) }, 200, cors);
      }

      // ---------- 任务 ----------
      if (path === '/api/tasks' && method === 'GET') {
        const { member } = await auth();
        const date = url.searchParams.get('date');
        let tasks;
        if (date !== null) {
          const day = requireDate(date);
          tasks = await storage.tasks.listByMemberDate(member.id, day);
        } else {
          const from = url.searchParams.get('from');
          const to = url.searchParams.get('to');
          if (!from || !to) throw badRequest('请提供 date 或 from/to 参数');
          const start = requireDate(from);
          const end = requireDate(to);
          const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
          if (span < 0) throw badRequest('结束日期不能早于开始日期');
          if (span > 400 * 86400000) throw badRequest('查询跨度不能超过 400 天');
          tasks = await storage.tasks.listByMemberRange(member.id, start, end);
        }
        return json({ tasks: tasks.map(taskDto) }, 200, cors);
      }

      const taskMatch = /^\/api\/tasks\/([^/]+)$/.exec(path);
      if (taskMatch) {
        const id = decodeSegment(taskMatch[1]);
        const { member, workspace } = await auth();

        if (method === 'PUT') {
          const existing = await storage.tasks.getById(id);
          if (existing && (existing.workspaceId !== workspace.id || existing.memberId !== member.id)) {
            throw notFound('任务不存在');
          }
          const task = parseTaskInput(await readBody(request), {
            id,
            workspaceId: workspace.id,
            memberId: member.id,
            now: clock(),
          });
          await storage.tasks.put(task);
          return json({ task: taskDto(task) }, 200, cors);
        }

        if (method === 'DELETE') {
          const ok = await storage.tasks.delete(id, member.id, workspace.id);
          if (!ok) throw notFound('任务不存在');
          return json({ ok: true }, 200, cors);
        }
      }

      // ---------- 模板 ----------
      if (path === '/api/templates' && method === 'GET') {
        const { member } = await auth();
        const templates = await storage.templates.listByMember(member.id);
        return json({ templates: templates.map(templateDto) }, 200, cors);
      }

      const templateMatch = /^\/api\/templates\/([^/]+)$/.exec(path);
      if (templateMatch) {
        const id = decodeSegment(templateMatch[1]);
        const { member, workspace } = await auth();

        if (method === 'PUT') {
          const existing = await storage.templates.getById(id);
          if (existing && (existing.workspaceId !== workspace.id || existing.memberId !== member.id)) {
            throw notFound('模板不存在');
          }
          const template = parseTemplateInput(await readBody(request), {
            id,
            workspaceId: workspace.id,
            memberId: member.id,
          });
          await storage.templates.put(template);
          return json({ template: templateDto(template) }, 200, cors);
        }

        if (method === 'DELETE') {
          const ok = await storage.templates.delete(id, member.id, workspace.id);
          if (!ok) throw notFound('模板不存在');
          return json({ ok: true }, 200, cors);
        }
      }

      // ---------- 内容批次 ----------
      if (path === '/api/batches' && method === 'GET') {
        const { workspace } = await auth();
        const rows = await storage.batches.listByWorkspace(workspace.id);
        const out = { topics: null, hotspots: null };
        for (const row of rows) {
          if (row.kind === 'topics' || row.kind === 'hotspots') out[row.kind] = batchDto(row);
        }
        return json(out, 200, cors);
      }

      const batchMatch = /^\/api\/batches\/([^/]+)\/refresh$/.exec(path);
      if (batchMatch && method === 'POST') {
        const kind = decodeSegment(batchMatch[1]);
        if (kind !== 'topics' && kind !== 'hotspots') throw notFound('批次类型不存在');
        const { workspace } = await auth();
        const input = asObject(await readBody(request));
        const date = requireDate(input.date);
        const row = await storage.batches.bump({
          workspaceId: workspace.id,
          kind,
          date,
          fetchedAt: clock(),
        });
        return json(
          { kind, date: row.date, seq: row.seq, fetchedAt: row.fetchedAt },
          200,
          cors,
        );
      }

      // ---------- 内容库（工作区共享） ----------
      if (path === '/api/saved' && method === 'GET') {
        const { workspace } = await auth();
        const rows = await storage.saved.listByWorkspace(workspace.id);
        return json({ saved: rows.map(savedDto) }, 200, cors);
      }

      const savedMatch = /^\/api\/saved\/([^/]+)$/.exec(path);
      if (savedMatch) {
        const id = decodeSegment(savedMatch[1]);
        const { member, workspace } = await auth();

        if (method === 'PUT') {
          const existing = await storage.saved.getById(id);
          if (existing && existing.workspaceId !== workspace.id) throw notFound('内容不存在');
          const input = asObject(await readBody(request));
          const row = parseSavedInput(input, {
            id,
            workspaceId: workspace.id,
            memberId: member.id,
            addedBy: existing ? existing.addedBy : member.id,
            now: clock(),
          });
          await storage.saved.put(row);
          return json({ saved: savedDto(row) }, 200, cors);
        }

        if (method === 'DELETE') {
          const ok = await storage.saved.delete(id, workspace.id);
          if (!ok) throw notFound('内容不存在');
          return json({ ok: true }, 200, cors);
        }
      }

      // ---------- 成员设置 ----------
      if (path === '/api/settings' && method === 'GET') {
        const { member } = await auth();
        return json({ settings: parseJsonOr(member.settings, {}) }, 200, cors);
      }

      if (path === '/api/settings' && method === 'PUT') {
        const { member } = await auth();
        const value = await readBody(request, { maxBytes: SETTINGS_LIMIT });
        const settings = JSON.stringify(value);
        if (byteLength(settings) > SETTINGS_LIMIT) throw tooLarge('设置内容不能超过 16KB');
        await storage.members.update(member.id, { settings });
        return json({ settings: value }, 200, cors);
      }

      // ---------- 导出 ----------
      if (path === '/api/export' && method === 'GET') {
        const { member, workspace } = await auth();
        const [tasks, templates, saved, batchRows] = await Promise.all([
          storage.tasks.listByMember(member.id),
          storage.templates.listByMember(member.id),
          storage.saved.listByWorkspace(workspace.id),
          storage.batches.listByWorkspace(workspace.id),
        ]);
        const batches = { topics: null, hotspots: null };
        for (const row of batchRows) {
          if (row.kind === 'topics' || row.kind === 'hotspots') batches[row.kind] = batchDto(row);
        }
        return json(
          {
            app: 'hms',
            version: 1,
            workspace: { id: workspace.id, code: workspace.code, name: workspace.name },
            me: { id: member.id, nickname: member.nickname },
            tasks: tasks.map(taskDto),
            templates: templates.map(templateDto),
            saved: saved.map(savedDto),
            batches,
          },
          200,
          cors,
        );
      }

      // ---------- 退出工作区 ----------
      if (path === '/api/leave' && method === 'POST') {
        const { member } = await auth();
        await storage.tasks.deleteByMember(member.id);
        await storage.templates.deleteByMember(member.id);
        await storage.members.update(member.id, { nickname: '已退出' });
        return json({ ok: true }, 200, cors);
      }

      throw notFound('接口不存在');
    } catch (err) {
      if (err instanceof ApiError) {
        const headers = err.retryAfter ? { 'retry-after': String(err.retryAfter) } : {};
        return json({ error: { code: err.code, message: err.message } }, err.status, cors, headers);
      }
      console.error('[api] 未处理异常', err);
      return json({ error: { code: 'SERVER_ERROR', message: '服务器内部错误' } }, 500, cors);
    }
  }

  return { handle };
}

// ---------------------------------------------------------------------------
// 纯函数工具
// ---------------------------------------------------------------------------

function normalizePath(pathname) {
  const path = pathname.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw badRequest('路径参数不合法');
  }
}

function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '127.0.0.1';
}

function asObject(value, label = '请求体') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${label}必须是 JSON 对象`);
  }
  return value;
}

function text(value, label, max, { min = 0 } = {}) {
  if (typeof value !== 'string') throw badRequest(`${label}格式不正确`);
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < min) throw badRequest(`${label}不能为空`);
  if (length > max) throw badRequest(`${label}不能超过 ${max} 个字符`);
  return trimmed;
}

function numberOr(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw badRequest(`${label}格式不正确`);
  return value;
}

function booleanOr(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

function requireDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('日期格式应为 YYYY-MM-DD');
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw badRequest('日期不存在');
  }
  return value;
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function tooLarge(message) {
  return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
}

async function readBody(request, { required = true, maxBytes = BODY_LIMIT } = {}) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge('请求体过大');
  const raw = await request.text();
  if (byteLength(raw) > maxBytes) throw tooLarge('请求体过大');
  if (raw.trim() === '') {
    if (!required) return undefined;
    throw badRequest('请求体不能为空');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('请求体不是合法的 JSON');
  }
}

function taskDto(task) {
  return {
    id: task.id,
    date: task.date,
    title: task.title,
    note: task.note,
    done: Boolean(task.done),
    done_at: task.doneAt ?? null,
    is_template: Boolean(task.isTemplate),
    order: task.sortOrder,
    created_at: task.createdAt,
  };
}

function templateDto(template) {
  return {
    id: template.id,
    title: template.title,
    note: template.note,
    order: template.sortOrder,
    active: Boolean(template.active),
  };
}

function savedDto(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    platform: row.platform,
    snapshot: parseJsonOr(row.snapshot, null),
    saved_at: row.savedAt,
  };
}

function batchDto(row) {
  return { date: row.date, seq: row.seq, fetchedAt: row.fetchedAt };
}

function parseJsonOr(raw, fallback) {
  try {
    const value = JSON.parse(raw);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function parseTaskInput(body, { id, workspaceId, memberId, now }) {
  const input = asObject(body);
  const date = requireDate(input.date);
  const title = text(input.title, '任务标题', 60);
  const note = input.note === undefined || input.note === null ? '' : text(input.note, '备注', 200);
  const done = booleanOr(input.done, false);
  let doneAt = input.done_at ?? input.doneAt ?? null;
  if (doneAt !== null) numberOr(doneAt, null, '完成时间');
  if (!done) doneAt = null;
  else if (doneAt === null) doneAt = now;
  const sortOrder = Math.trunc(numberOr(input.order, 0, '排序值'));
  const createdAt = Math.trunc(numberOr(input.created_at ?? input.createdAt, now, '创建时间'));
  return {
    id,
    workspaceId,
    memberId,
    date,
    title,
    note,
    done: done ? 1 : 0,
    doneAt,
    isTemplate: booleanOr(input.is_template ?? input.isTemplate, false) ? 1 : 0,
    sortOrder,
    createdAt,
  };
}

function parseTemplateInput(body, { id, workspaceId, memberId }) {
  const input = asObject(body);
  const title = text(input.title, '模板标题', 60);
  const note = input.note === undefined || input.note === null ? '' : text(input.note, '备注', 200);
  const sortOrder = Math.trunc(numberOr(input.order, 0, '排序值'));
  return {
    id,
    workspaceId,
    memberId,
    title,
    note,
    sortOrder,
    active: booleanOr(input.active, true) ? 1 : 0,
  };
}

function parseSavedInput(body, { id, workspaceId, memberId, addedBy, now }) {
  const input = asObject(body);
  const kind = input.kind;
  if (kind !== 'topic' && kind !== 'hotspot') throw badRequest('内容类型不正确');
  const status = input.status;
  if (status !== 'saved' && status !== 'used') throw badRequest('内容状态不正确');
  const platform = input.platform;
  if (platform !== 'douyin' && platform !== 'xiaohongshu') throw badRequest('平台不正确');
  const title = text(input.title, '标题', 120);
  const snapshot = input.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw badRequest('内容快照格式不正确');
  }
  const serialized = JSON.stringify(snapshot);
  if (byteLength(serialized) > SNAPSHOT_LIMIT) throw tooLarge('内容快照不能超过 64KB');
  return {
    id,
    workspaceId,
    kind,
    status,
    title,
    platform,
    snapshot: serialized,
    savedAt: Math.trunc(numberOr(input.saved_at ?? input.savedAt, now, '保存时间')),
    addedBy,
  };
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (const byte of bytes) code += CODE_CHARS[byte % CODE_CHARS.length];
  return code;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
