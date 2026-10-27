/** Cloudflare Worker 入口：D1 binding → storage → 共用 handler。 */

import { createApi } from '../server/handler.mjs';
import { createD1Storage } from './storage-d1.mjs';

// 同一 isolate 内按 D1 binding 缓存 API 实例，限流计数才能跨请求累计
const instances = new WeakMap();

function getApi(env) {
  if (!env?.DB) throw new Error('缺少 D1 binding：请检查 wrangler.jsonc 里的 d1_databases');
  let api = instances.get(env.DB);
  if (!api) {
    api = createApi({
      storage: createD1Storage(env.DB),
      now: () => Date.now(),
      env,
    });
    instances.set(env.DB, api);
  }
  return api;
}

export default {
  async fetch(request, env) {
    return getApi(env).handle(request);
  },
};
