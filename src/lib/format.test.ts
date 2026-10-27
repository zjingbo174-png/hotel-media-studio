import { describe, expect, it } from 'vitest';
import { fingerprint, formatCount, platformSearchUrl, safeExternalUrl } from './format';

describe('外部链接白名单', () => {
  it('只放行 https 的抖音/小红书域名', () => {
    expect(safeExternalUrl('https://www.douyin.com/search/%E9%85%92%E5%BA%97')).toContain('douyin.com');
    expect(safeExternalUrl('https://www.xiaohongshu.com/search_result?keyword=abc')).toContain('xiaohongshu.com');
    expect(safeExternalUrl('https://v.douyin.com/abcd/')).toContain('douyin.com');
  });

  it('拒绝 javascript、http、仿冒域名', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('http://www.douyin.com/search/a')).toBeNull();
    expect(safeExternalUrl('https://douyin.com.evil.com/search/a')).toBeNull();
    expect(safeExternalUrl('https://evil.com/?next=douyin.com')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
  });
});

describe('展示用格式化', () => {
  it('数字缩写', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12000)).toBe('1.2w');
    expect(formatCount(120000000)).toBe('1.2亿');
  });

  it('内容指纹稳定且可读', () => {
    const a = fingerprint('douyin', '凌晨两点，客人问我能不能帮他写一封分手信');
    const b = fingerprint('douyin', '凌晨两点 客人问我能不能帮他写一封分手信！');
    expect(a).toBe(b);
    expect(a.startsWith('douyin:')).toBe(true);
    expect(fingerprint('xiaohongshu', 'x')).not.toBe(a);
  });

  it('搜索页地址按平台生成且编码关键词', () => {
    expect(platformSearchUrl('douyin', '酒店 前台')).toContain('%E9%85%92%E5%BA%97');
    expect(platformSearchUrl('xiaohongshu', 'a b')).toBe(
      'https://www.xiaohongshu.com/search_result?keyword=a%20b',
    );
  });
});
