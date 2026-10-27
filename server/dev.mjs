/**
 * 本地 Node 开发服务器：把 Node 的 http.IncomingMessage 转成 Fetch Request，
 * 交给 server/handler.mjs，再把 Fetch Response 写回 Node 响应。
 * 启动：node server/dev.mjs    地址：http://127.0.0.1:8787
 */

import http from 'node:http';
import { createApi } from './handler.mjs';
import { createJsonStorage } from './storage-json.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const BODY_BUFFER_LIMIT = 1024 * 1024;

const env = {
  ...process.env,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '*',
};

const storage = await createJsonStorage({ file: process.env.HMS_DATA_FILE });
const api = createApi({ storage, env, now: () => Date.now() });

/** 读取请求体，超过缓冲上限直接标记，交给 handler 统一返回 413。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let overflow = false;
    req.on('data', (chunk) => {
      if (overflow) return;
      size += chunk.length;
      if (size > BODY_BUFFER_LIMIT) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(overflow ? Buffer.alloc(BODY_BUFFER_LIMIT + 1) : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const SKIP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'content-length',
  'host',
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host || `${HOST}:${PORT}`}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (SKIP_HEADERS.has(key) || value === undefined) continue;
      if (Array.isArray(value)) for (const item of value) headers.append(key, item);
      else headers.set(key, value);
    }
    if (!headers.has('x-forwarded-for')) {
      headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
    }

    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await readBody(req);
      if (body.length > 0) init.body = body;
    }

    const response = await api.handle(new Request(url, init));
    const outHeaders = {};
    response.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    const payload = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, outHeaders);
    res.end(payload);
  } catch (err) {
    console.error('[dev] 请求处理失败', err);
    const body = JSON.stringify({ error: { code: 'SERVER_ERROR', message: '服务器内部错误' } });
    res.writeHead(500, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    res.end(body);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`hms-api dev server: http://${HOST}:${PORT}`);
  console.log(`data file: ${storage.file}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
