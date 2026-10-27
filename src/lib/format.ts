import type { Metrics } from '../types';

export function formatCount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatMetrics(m: Metrics): string {
  return `${formatCount(m.like)} 赞 · ${formatCount(m.collect)} 藏 · ${formatCount(m.comment)} 评`;
}

/** 归一化标题作为内容指纹（跨批次识别同一条内容的收藏状态） */
export function fingerprint(platform: string, title: string): string {
  return `${platform}:${title
    .replace(/[\s#【】[\]（）()、,，。.!！?？:：;；"'“”‘’]/g, '')
    .slice(0, 40)}`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const GRADIENTS = [
  'from-[#f3d9c4] to-[#e0a07c]',
  'from-[#d8e4d4] to-[#8fb29a]',
  'from-[#efd6d8] to-[#d99aa5]',
  'from-[#dfe1ec] to-[#a3a9c9]',
  'from-[#f1e3c6] to-[#d7b877]',
  'from-[#d6e6ea] to-[#8fb3bd]',
  'from-[#e9dcd0] to-[#bb9b82]',
  'from-[#e5dfe9] to-[#a99ab5]',
  'from-[#f0dcd0] to-[#c98d74]',
  'from-[#dbe6d8] to-[#9db694]',
  'from-[#f2e0c9] to-[#d8a45b]',
  'from-[#d9dfe8] to-[#93a2b8]',
];

export function coverGradient(seed: number): string {
  const idx = ((seed - 1) % GRADIENTS.length + GRADIENTS.length) % GRADIENTS.length;
  return GRADIENTS[idx];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 平台搜索页跳转地址（Mock 阶段的「演示链接」，不是原视频） */
export function platformSearchUrl(platform: 'douyin' | 'xiaohongshu', keyword: string): string {
  const q = encodeURIComponent(keyword);
  return platform === 'douyin'
    ? `https://www.douyin.com/search/${q}`
    : `https://www.xiaohongshu.com/search_result?keyword=${q}`;
}

const ALLOWED_HOSTS = ['douyin.com', 'xiaohongshu.com'];

/** 只允许 https 且属于目标平台域名，防止导入数据里的 javascript: / 钓鱼链接 */
export function safeExternalUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    return allowed ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 打开外部链接；返回 false 表示链接不可信（调用方应提示并给复制兜底） */
export function openExternal(url: string): boolean {
  const safe = safeExternalUrl(url);
  if (!safe) return false;
  window.open(safe, '_blank', 'noopener,noreferrer');
  return true;
}
