/**
 * 多人协作后端集成测试（纯 Node，无测试框架）。
 * 直接 import handler + JSON storage，用假时钟保证批次/限流可重复。
 * 运行：node scripts/api-test.mjs
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/handler.mjs';
import { createJsonStorage } from '../server/storage-json.mjs';

const TASKS_DATE = '2026-03-01';
const CONCURRENT_DATE = '2026-03-02';
const SEED_DATE = '2026-03-03';

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'hms-api-test-'));
const dataFile = path.join(tempDir, 'db.json');
const storage = await createJsonStorage({ file: dataFile });

let clock = Date.UTC(2026, 2, 1, 2, 0, 0);
const api = createApi({
  storage,
  now: () => clock,
  env: { ALLOWED_ORIGINS: '*' },
});

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message.split('\n')[0]}`);
  }
}

async function call(method, urlPath, { token, body, ip = '198.51.100.7', headers } = {}) {
  const h = new Headers(headers ?? {});
  h.set('x-forwarded-for', ip);
  if (token) h.set('authorization', `Bearer ${token}`);
  let payload;
  if (body !== undefined) {
    h.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  const response = await api.handle(
    new Request(`http://127.0.0.1:8787${urlPath}`, { method, headers: h, body: payload }),
  );
  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return { status: response.status, data, headers: response.headers };
}

/** 建一条前端 Task 形状的请求体。 */
function taskBody({ date, title, order = 0, done = false }) {
  return {
    date,
    title,
    note: '',
    done,
    done_at: null,
    is_template: false,
    order,
    created_at: clock,
  };
}

const state = {
  workspaces: [],
  members: [],
};

try {
  console.log(`临时数据文件：${dataFile}\n`);

  await test('健康检查返回 ok/version/time 与 CORS 头', async () => {
    const res = await call('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.version, '1');
    assert.equal(typeof res.data.time, 'number');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  await test('OPTIONS 预检返回 204 且允许 Authorization', async () => {
    const res = await call('OPTIONS', '/api/tasks');
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /PUT/);
    assert.match(res.headers.get('access-control-allow-headers') ?? '', /Authorization/);
  });

  await test('创建 2 个工作区，6 位码唯一且字符集正确', async () => {
    for (let i = 1; i <= 2; i += 1) {
      const res = await call('POST', '/api/workspaces', {
        body: { name: `测试团队${i}` },
        ip: '198.51.100.10',
      });
      assert.equal(res.status, 200);
      assert.match(res.data.code, /^[2-9A-HJ-NP-Z]{6}$/);
      assert.equal(res.data.name, `测试团队${i}`);
      assert.ok(res.data.workspaceId);
      state.workspaces.push(res.data);
    }
    assert.notEqual(state.workspaces[0].code, state.workspaces[1].code);
  });

  await test('同一工作区加入 10 个成员，token 各不相同', async () => {
    const ws = state.workspaces[0];
    for (let i = 1; i <= 10; i += 1) {
      const res = await call('POST', '/api/sessions', {
        body: { code: ws.code, nickname: `成员${i}` },
        ip: `10.1.0.${i}`,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.workspaceId, ws.workspaceId);
      assert.equal(res.data.workspaceName, ws.name);
      assert.equal(res.data.nickname, `成员${i}`);
      assert.equal(typeof res.data.token, 'string');
      assert.ok(res.data.token.length >= 40, 'token 应为 32 字节 base64url');
      assert.deepEqual(res.data.settings, {});
      state.members.push(res.data);
    }
    assert.equal(new Set(state.members.map((m) => m.token)).size, 10);
  });

  await test('10 人各自 PUT 一条任务，只能 GET 到自己的', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await call('PUT', `/api/tasks/task-${i + 1}`, {
        token: state.members[i].token,
        body: taskBody({ date: TASKS_DATE, title: `任务-${i + 1}`, order: i }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.task.id, `task-${i + 1}`);
      assert.equal(res.data.task.title, `任务-${i + 1}`);
    }
    for (let i = 0; i < 10; i += 1) {
      const res = await call('GET', `/api/tasks?date=${TASKS_DATE}`, {
        token: state.members[i].token,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.tasks.length, 1);
      assert.equal(res.data.tasks[0].id, `task-${i + 1}`);
      assert.equal(res.data.tasks[0].title, `任务-${i + 1}`);
    }
  });

  await test('成员 A 删除成员 B 的任务返回 404，B 的任务仍在', async () => {
    const res = await call('DELETE', '/api/tasks/task-2', {
      token: state.members[0].token,
    });
    assert.equal(res.status, 404);
    assert.equal(res.data.error.code, 'NOT_FOUND');

    const bTasks = await call('GET', `/api/tasks?date=${TASKS_DATE}`, {
      token: state.members[1].token,
    });
    assert.equal(bTasks.data.tasks.length, 1);
    assert.equal(bTasks.data.tasks[0].id, 'task-2');
  });

  await test('错误 token → 401，错误工作区码 → 404', async () => {
    const badToken = await call('GET', '/api/me', { token: 'not-a-real-token' });
    assert.equal(badToken.status, 401);
    assert.equal(badToken.data.error.code, 'UNAUTHORIZED');
    assert.equal(badToken.headers.get('access-control-allow-origin'), '*');

    const badCode = await call('POST', '/api/sessions', {
      body: { code: 'ZZZZZZ', nickname: '路人' },
      ip: '198.51.100.20',
    });
    assert.equal(badCode.status, 404);
    assert.equal(badCode.data.error.code, 'NOT_FOUND');
  });

  await test('seed 幂等：调两次仍只有 2 条默认任务 + 2 个默认模板', async () => {
    const token = state.members[0].token;
    const first = await call('POST', '/api/seed', {
      token,
      body: { date: SEED_DATE },
    });
    assert.equal(first.status, 200);
    assert.equal(first.data.tasks.length, 2);
    assert.equal(first.data.templates.length, 2);
    assert.deepEqual(
      first.data.templates.map((t) => t.title).sort(),
      ['排房', '离店房态价格'].sort(),
    );

    const second = await call('POST', '/api/seed', {
      token,
      body: { date: SEED_DATE },
    });
    assert.equal(second.status, 200);
    assert.equal(second.data.tasks.length, 2);
    assert.equal(second.data.templates.length, 2);

    const tasks = await call('GET', `/api/tasks?date=${SEED_DATE}`, { token });
    assert.equal(tasks.data.tasks.length, 2);
    const templates = await call('GET', '/api/templates', { token });
    assert.equal(templates.data.templates.length, 2);
  });

  await test('批次刷新：同日 seq 1→2，换天重新从 1 开始', async () => {
    const token = state.members[0].token;
    const first = await call('POST', '/api/batches/topics/refresh', {
      token,
      body: { date: TASKS_DATE },
    });
    assert.equal(first.status, 200);
    assert.deepEqual(
      { kind: first.data.kind, date: first.data.date, seq: first.data.seq },
      { kind: 'topics', date: TASKS_DATE, seq: 1 },
    );

    const second = await call('POST', '/api/batches/topics/refresh', {
      token,
      body: { date: TASKS_DATE },
    });
    assert.equal(second.data.seq, 2);
    assert.ok(second.data.fetchedAt >= first.data.fetchedAt);

    const nextDay = await call('POST', '/api/batches/topics/refresh', {
      token,
      body: { date: CONCURRENT_DATE },
    });
    assert.equal(nextDay.data.seq, 1);

    const batches = await call('GET', '/api/batches', { token });
    assert.equal(batches.status, 200);
    assert.equal(batches.data.topics.date, CONCURRENT_DATE);
    assert.equal(batches.data.topics.seq, 1);
    assert.equal(batches.data.hotspots, null);
  });

  await test('saved 工作区共享：A 写 B 读，B 删 A 读不到', async () => {
    const [a, b] = state.members;
    const body = {
      kind: 'topic',
      status: 'saved',
      title: '共享选题',
      platform: 'douyin',
      snapshot: { id: 'snap-1', title: '共享选题' },
      saved_at: clock,
    };
    const put = await call('PUT', '/api/saved/shared-saved-1', {
      token: a.token,
      body,
    });
    assert.equal(put.status, 200);
    assert.equal(put.data.saved.id, 'shared-saved-1');
    assert.equal(put.data.saved.saved_at, clock);

    const seenByB = await call('GET', '/api/saved', { token: b.token });
    assert.deepEqual(
      seenByB.data.saved.map((s) => s.id),
      ['shared-saved-1'],
    );

    const removed = await call('DELETE', '/api/saved/shared-saved-1', {
      token: b.token,
    });
    assert.equal(removed.status, 200);

    const seenByA = await call('GET', '/api/saved', { token: a.token });
    assert.equal(seenByA.data.saved.length, 0);
  });

  await test('并发：10 人同时写任务全部成功，每人恰好 1 条不丢数据', async () => {
    const results = await Promise.all(
      state.members.map((member, i) =>
        call('PUT', `/api/tasks/concurrent-${i + 1}`, {
          token: member.token,
          body: taskBody({ date: CONCURRENT_DATE, title: `并发-${i + 1}` }),
        }),
      ),
    );
    for (const res of results) {
      assert.equal(res.status, 200);
      assert.ok(res.data.task.id.startsWith('concurrent-'));
    }
    for (let i = 0; i < 10; i += 1) {
      const res = await call('GET', `/api/tasks?date=${CONCURRENT_DATE}`, {
        token: state.members[i].token,
      });
      assert.equal(res.data.tasks.length, 1);
      assert.equal(res.data.tasks[0].title, `并发-${i + 1}`);
    }
  });

  await test('限流：同 IP 连续 11 次错误 code 的 sessions，第 11 次 429', async () => {
    const statuses = [];
    let last = null;
    for (let i = 0; i < 11; i += 1) {
      last = await call('POST', '/api/sessions', {
        body: { code: 'ZZZZZZ', nickname: '限流测试' },
        ip: '203.0.113.77',
      });
      statuses.push(last.status);
    }
    assert.deepEqual(
      statuses.slice(0, 10),
      Array(10).fill(404),
      `前 10 次应为 404，实际 ${statuses.join(',')}`,
    );
    assert.equal(statuses[10], 429);
    assert.equal(last.data.error.code, 'RATE_LIMITED');
  });

  await test('超长输入：昵称 17 字 → 400，任务标题 61 字 → 400', async () => {
    const longNickname = await call('POST', '/api/sessions', {
      body: { code: state.workspaces[0].code, nickname: 'a'.repeat(17) },
      ip: '198.51.100.78',
    });
    assert.equal(longNickname.status, 400);
    assert.equal(longNickname.data.error.code, 'BAD_REQUEST');

    const longTitle = await call('PUT', '/api/tasks/too-long', {
      token: state.members[0].token,
      body: taskBody({ date: TASKS_DATE, title: 'a'.repeat(61) }),
    });
    assert.equal(longTitle.status, 400);
    assert.equal(longTitle.data.error.code, 'BAD_REQUEST');
  });

  await test('范围查询可用，超过 400 天 → 400', async () => {
    const range = await call(
      'GET',
      `/api/tasks?from=${TASKS_DATE}&to=${CONCURRENT_DATE}`,
      { token: state.members[0].token },
    );
    assert.equal(range.status, 200);
    assert.equal(range.data.tasks.length, 2);

    const tooWide = await call(
      'GET',
      '/api/tasks?from=2024-01-01&to=2026-01-01',
      { token: state.members[0].token },
    );
    assert.equal(tooWide.status, 400);
  });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`\nPASS ${passed} / FAIL ${failed}`);
if (failed > 0) {
  for (const { name, err } of failures) {
    console.log(`\n[${name}]`);
    console.log(err.stack || err.message);
  }
  process.exitCode = 1;
}
