import { describe, expect, it } from 'vitest';
import topicsJson from './topics.json';
import hotspotsJson from './hotspots.json';
import type { Hotspot, Topic } from '../types';

const topics = topicsJson as unknown as Topic[];
const hotspots = (hotspotsJson as unknown as Hotspot[]).slice().sort((a, b) => a.rank - b.rank);

/**
 * 数据质量闸门：不通过则 `npm run check:data` / 构建前测试失败。
 * 目的是防止「逐条分析」被模板套话糊弄。
 */
describe('选题演示数据', () => {
  it('数量与平台分布达标', () => {
    expect(topics.length).toBeGreaterThanOrEqual(12);
    const douyin = topics.filter((t) => t.platform === 'douyin').length;
    const xhs = topics.filter((t) => t.platform === 'xiaohongshu').length;
    expect(douyin).toBeGreaterThanOrEqual(5);
    expect(xhs).toBeGreaterThanOrEqual(5);
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
  });

  it('每条都有完整字段与基础长度', () => {
    for (const t of topics) {
      expect(t.title.length, `${t.id} title`).toBeGreaterThanOrEqual(8);
      expect(t.copy.length, `${t.id} copy`).toBeGreaterThanOrEqual(30);
      expect(t.tags.length, `${t.id} tags`).toBeGreaterThanOrEqual(3);
      expect(t.keywords.length, `${t.id} keywords`).toBeGreaterThanOrEqual(3);
      expect(t.coverSeed).toBeGreaterThanOrEqual(1);
      expect(t.coverSeed).toBeLessThanOrEqual(12);
      expect(t.metrics.like).toBeGreaterThan(0);
      expect(t.metrics.like).toBeGreaterThan(t.metrics.comment);
    }
  });

  it('归因 4 个维度齐全、>=60 字、且复用了该条关键词', () => {
    for (const t of topics) {
      for (const key of ['gap', 'hook', 'keywords', 'format'] as const) {
        const text = t.analysis[key];
        expect(text, `${t.id}.${key} 缺失`).toBeTruthy();
        expect(text.length, `${t.id}.${key} 太短`).toBeGreaterThanOrEqual(60);
      }
      const all = Object.values(t.analysis).join('');
      const hit = t.keywords.some((kw) => all.includes(kw) || all.includes(kw.replace('#', '')));
      const tagHit = t.tags.some((tag) => all.includes(tag.replace('#', '')));
      expect(hit || tagHit, `${t.id} 归因未引用自身关键词/话题`).toBe(true);
    }
  });

  it('原创思路 >=2 条且结构完整', () => {
    for (const t of topics) {
      expect(t.ideas.length, `${t.id} ideas`).toBeGreaterThanOrEqual(2);
      for (const idea of t.ideas) {
        expect(idea.title.length).toBeGreaterThan(0);
        expect(idea.structure.length).toBeGreaterThanOrEqual(3);
        expect(idea.altTitles.length).toBeGreaterThanOrEqual(1);
        expect(idea.shotList.length).toBeGreaterThanOrEqual(2);
        expect(idea.hotelAngle.length).toBeGreaterThanOrEqual(10);
        expect(idea.publishTip.length).toBeGreaterThanOrEqual(10);
      }
    }
  });
});

describe('热点演示数据', () => {
  it('数量、排名唯一且 3 套方案齐全', () => {
    expect(hotspots.length).toBeGreaterThanOrEqual(10);
    const ranks = hotspots.map((h) => h.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: hotspots.length }, (_, i) => i + 1));
    expect(new Set(hotspots.map((h) => h.id)).size).toBe(hotspots.length);

    for (const h of hotspots) {
      expect(h.plans.length, `${h.id} plans`).toBe(3);
      const types = h.plans.map((p) => p.type).sort().join('');
      expect(types, `${h.id} 方案类型`).toBe('ABC');
      for (const plan of h.plans) {
        expect(plan.storyboard.length, `${h.id}.${plan.type} 分镜`).toBe(6);
        expect(plan.shotList.length).toBeGreaterThanOrEqual(3);
        expect(plan.concept.length).toBeGreaterThanOrEqual(20);
        expect(plan.risk.length).toBeGreaterThanOrEqual(10);
        plan.storyboard.forEach((shot, idx) => {
          expect(shot.shot, `${h.id}.${plan.type} 镜头序号`).toBe(idx + 1);
          expect(shot.visual.length).toBeGreaterThan(0);
          expect(shot.line.length).toBeGreaterThan(0);
          expect(shot.duration.length).toBeGreaterThan(0);
        });
      }
    }
  });

  it('风格拆解 5 项齐全且有复用/替换清单', () => {
    const keys = ['persona', 'opening', 'narrative', 'audioVisual', 'commentHook'] as const;
    for (const h of hotspots) {
      for (const key of keys) {
        expect(h.breakdown[key].length, `${h.id}.${key}`).toBeGreaterThanOrEqual(30);
      }
      expect(h.reusable.length).toBe(3);
      expect(h.mustReplace.length).toBeGreaterThanOrEqual(2);
      expect(h.styleTags.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('赛道与平台分布合理', () => {
    expect(new Set(hotspots.map((h) => h.track)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(hotspots.map((h) => h.platform)).size).toBe(2);
  });
});
