/** 全局领域类型：数据、批次、任务、内容库、设置。 */

export type Platform = 'douyin' | 'xiaohongshu';

export const PLATFORM_LABEL: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
};

/** 单条条目的火爆原因归因（4 个维度，均需具体到该条内容）。 */
export interface TopicAnalysis {
  /** 选题缺口：满足了什么未被满足的需求。 */
  gap: string;
  /** 文案钩子：开头 3 秒 / 标题的句式与有效性。 */
  hook: string;
  /** 关键词与话题：搜索词布局与话题借势。 */
  keywords: string;
  /** 形式与节奏：载体、时长、字幕、封面等可迁移结构。 */
  format: string;
}

/** 一条原创创作思路（看完能开拍）。 */
export interface TopicIdea {
  /** 主标题。 */
  title: string;
  /** 备选标题（建议 1-2 个）。 */
  altTitles: string[];
  /** 内容结构：3-5 个节点。 */
  structure: string[];
  /** 酒店场景切入点。 */
  hotelAngle: string;
  /** 拍摄 / 素材清单。 */
  shotList: string[];
  /** 发布建议（时长 / 时段 / 话题）。 */
  publishTip: string;
}

export interface Metrics {
  like: number;
  collect: number;
  comment: number;
}

/** 选题灵感条目。 */
export interface Topic {
  id: string;
  platform: Platform;
  /** 标题 / 首句文案。 */
  title: string;
  /** 正文摘要（1-3 句，自写演示文案）。 */
  copy: string;
  /** 虚构演示账号。 */
  author: string;
  metrics: Metrics;
  /** 相对发布时间，如「今天 09:20」。 */
  publishedAt: string;
  /** 话题标签，带 #。 */
  tags: string[];
  /** 搜索关键词（3-5 个，第一个用于生成跳转搜索页）。 */
  keywords: string[];
  /** 封面渐变种子 1-12。 */
  coverSeed: number;
  /** 酒店场景标签。 */
  scene: string;
  analysis: TopicAnalysis;
  /** 原创思路，至少 2 条。 */
  ideas: TopicIdea[];
}

/** 二创方案：A 同结构换场景 / B 换主角视角 / C 换冲突或结论。 */
export type PlanType = 'A' | 'B' | 'C';

export interface StoryboardShot {
  shot: number;
  visual: string;
  line: string;
  duration: string;
  tip: string;
}

export interface RecreatePlan {
  type: PlanType;
  /** 改编维度名称。 */
  dimension: string;
  /** 改编思路。 */
  concept: string;
  /** 分镜 6 格。 */
  storyboard: StoryboardShot[];
  /** 口播 / 字幕要点。 */
  script: string;
  /** 拍摄清单。 */
  shotList: string[];
  /** BGM 与字幕风格建议。 */
  bgm: string;
  /** 封面建议。 */
  cover: string;
  /** 发布建议。 */
  publishTip: string;
  /** 去重与合规提醒。 */
  risk: string;
}

/** 爆款热点条目。 */
export interface Hotspot {
  id: string;
  rank: number;
  /** 排名变化：正数上升，负数下降，0 持平。 */
  rankDelta: number;
  /** 本期新上榜。 */
  isNew: boolean;
  platform: Platform;
  /** 虚构演示账号。 */
  account: string;
  /** 粉丝量级，如「12.6w（示例）」。 */
  followers: string;
  title: string;
  metrics: {
    play: string;
    like: string;
    comment: string;
  };
  /** 风格标签，2-4 个。 */
  styleTags: string[];
  /** 赛道。 */
  track: string;
  /** 账号风格拆解（5 项齐全）。 */
  breakdown: {
    persona: string;
    opening: string;
    narrative: string;
    audioVisual: string;
    commentHook: string;
  };
  /** 可复用素材点（3 个）。 */
  reusable: string[];
  /** 必须替换、不能照搬的部分。 */
  mustReplace: string[];
  /** 三套二创方案。 */
  plans: RecreatePlan[];
}

/** 一次「采集」产生的批次（纯前端演示：batchKey = 日期 + 自增序号）。 */
export interface BatchMeta {
  id: string;
  date: string;
  seq: number;
  fetchedAt: number;
  sourceId: string;
}

export interface TopicBatch {
  meta: BatchMeta;
  items: Topic[];
}

export interface HotspotBatch {
  meta: BatchMeta;
  items: Hotspot[];
}

/** 每日任务。 */
export interface Task {
  /** `${date}:${uid}` */
  id: string;
  /** Asia/Shanghai 日期 YYYY-MM-DD */
  date: string;
  title: string;
  note: string;
  done: boolean;
  doneAt: number | null;
  /** 是否为「每日固定」模板任务（模板本身存在 settings/templates） */
  isTemplate: boolean;
  order: number;
  createdAt: number;
}

/** 每日固定任务模板。 */
export interface TaskTemplate {
  id: string;
  title: string;
  note: string;
  order: number;
  active: boolean;
}

/** 内容库条目：跨批次保留的收藏 / 已用。 */
export interface SavedItem {
  /** `${kind}:${platform}:${fingerprint}` */
  id: string;
  kind: 'topic' | 'hotspot';
  status: 'saved' | 'used';
  title: string;
  platform: Platform;
  /** 保存时的内容快照，原批次失效也能看。 */
  snapshot: Topic | Hotspot;
  savedAt: number;
}

export type NavStyle = 'side' | 'bottom';

export interface Settings {
  id: 'app';
  navStyle: NavStyle;
  /** 下班前提醒时间 HH:mm，null 表示关闭 */
  reminderTime: string | null;
  /** 是否启用浏览器通知 */
  browserNotify: boolean;
  /** 最近一次提醒日期（防止一天重复提醒） */
  lastRemindedDate: string | null;
  /** 最近一次自动生成清单的日期（防止删除任务后重载又被种回） */
  lastSeedDate: string | null;
  dataSource: string;
  schemaVersion: number;
}

export const SCHEMA_VERSION = 1;

/** 数据源能力描述。 */
export interface SourceCapabilities {
  realtime: boolean;
  requiresAuth: boolean;
  note: string;
}

export interface ContentSource {
  id: string;
  label: string;
  capabilities: SourceCapabilities;
  fetchTopics(date: string, seq: number): Promise<TopicBatch>;
  fetchHotspots(date: string, seq: number): Promise<HotspotBatch>;
}
