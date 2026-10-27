import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * 把构建产物发布成可被 CDN 直接访问的静态站点目录（site/）。
 * 用途：GitHub Pages 在国内常不可达，而 jsDelivr / Statically / raw.githack
 * 这类「GitHub 内容 CDN」在国内多数网络可以打开，且访问者与部署者都无需额外账号。
 *
 * 用法：
 *   node scripts/publish-site.mjs          # 使用现有 dist/
 *   node scripts/publish-site.mjs --build  # 先构建再复制
 */

const build = process.argv.includes('--build');
if (build) {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
}

const dist = path.resolve('dist');
const site = path.resolve('site');

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await cp(dist, site, { recursive: true });
// 让 GitHub Pages / 一些静态服务不启用 Jekyll
await writeFile(path.join(site, '.nojekyll'), '');

const owner = 'zjingbo174-png';
const repo = 'hotel-media-studio';
const rel = 'site/index.html';

console.log('\n已生成 site/（记得 git add site && git push）\n');
console.log('部署后可用以下地址访问（互为主备，哪个快用哪个）：');
console.log(`  jsDelivr      https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${rel}`);
console.log(`  jsDelivr 镜像 https://fastly.jsdelivr.net/gh/${owner}/${repo}@main/${rel}`);
console.log(`  jsDelivr 镜像 https://gcore.jsdelivr.net/gh/${owner}/${repo}@main/${rel}`);
console.log(`  Statically    https://cdn.statically.io/gh/${owner}/${repo}/main/${rel}`);
console.log(`  raw.githack   https://raw.githack.com/${owner}/${repo}/main/${rel}`);
console.log('\n注意：CDN 会缓存，更新后可能有几分钟到几小时延迟；可用版本号（如 @v1.0.1）强制新路径。');
