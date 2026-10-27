import type { ContentSource } from '../../types';
import { mockSource } from './mock';

/**
 * 数据源注册表。
 * V2 接入方式：
 * - manual：用户粘贴抖音/小红书链接 → 生成一条待分析内容；
 * - api：第三方数据服务或自建服务端接口（密钥只在本地填写，不入库不入仓）。
 */
const sources: Record<string, ContentSource> = {
  mock: mockSource,
};

export function getSource(id: string = 'mock'): ContentSource {
  return sources[id] ?? mockSource;
}

export { mockSource };
