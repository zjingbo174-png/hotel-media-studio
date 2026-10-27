import type { Hotspot, RecreatePlan, Topic } from '../types';
import { PLATFORM_LABEL } from '../types';

export function planToMarkdown(hotspot: Hotspot, plan: RecreatePlan): string {
  const lines: string[] = [];
  lines.push(`# 二创方案 ${plan.type}｜${plan.dimension}`);
  lines.push(`原热点：${hotspot.title}（${PLATFORM_LABEL[hotspot.platform]} · ${hotspot.account}）`);
  lines.push(`改编思路：${plan.concept}`);
  lines.push('');
  lines.push('## 分镜大纲');
  lines.push('| 镜头 | 画面 | 台词/字幕 | 时长 | 拍摄要点 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const shot of plan.storyboard) {
    lines.push(`| ${shot.shot} | ${shot.visual} | ${shot.line} | ${shot.duration} | ${shot.tip} |`);
  }
  lines.push('');
  lines.push(`## 口播/字幕要点\n${plan.script}`);
  lines.push(`## 拍摄清单\n${plan.shotList.map((s) => `- ${s}`).join('\n')}`);
  lines.push(`## BGM 与封面\n- 音乐/字幕：${plan.bgm}\n- 封面：${plan.cover}`);
  lines.push(`## 发布建议\n${plan.publishTip}`);
  lines.push(`## 去重与合规\n${plan.risk}`);
  return lines.join('\n');
}

export function hotspotToMarkdown(hotspot: Hotspot): string {
  const lines: string[] = [];
  lines.push(`# ${hotspot.title}`);
  lines.push(
    `排名 #${hotspot.rank} · ${PLATFORM_LABEL[hotspot.platform]} · ${hotspot.account}（${hotspot.followers}） · 赛道：${hotspot.track}`,
  );
  lines.push(`播放 ${hotspot.metrics.play} · 点赞 ${hotspot.metrics.like} · 评论 ${hotspot.metrics.comment}`);
  lines.push('');
  lines.push('## 账号风格拆解');
  lines.push(`- 人设定位：${hotspot.breakdown.persona}`);
  lines.push(`- 开头 3 秒：${hotspot.breakdown.opening}`);
  lines.push(`- 叙事结构：${hotspot.breakdown.narrative}`);
  lines.push(`- 视听元素：${hotspot.breakdown.audioVisual}`);
  lines.push(`- 评论区钩子：${hotspot.breakdown.commentHook}`);
  lines.push('');
  lines.push(`## 可复用素材点\n${hotspot.reusable.map((r) => `- ${r}`).join('\n')}`);
  lines.push(`## 必须替换\n${hotspot.mustReplace.map((r) => `- ${r}`).join('\n')}`);
  lines.push('');
  for (const plan of hotspot.plans) {
    lines.push('');
    lines.push('---');
    lines.push(planToMarkdown(hotspot, plan));
  }
  return lines.join('\n');
}

export function topicToMarkdown(topic: Topic): string {
  const lines: string[] = [];
  lines.push(`# ${topic.title}`);
  lines.push(`${PLATFORM_LABEL[topic.platform]} · ${topic.author} · ${topic.publishedAt}`);
  lines.push('');
  lines.push(`原文案：${topic.copy}`);
  lines.push(`话题：${topic.tags.join(' ')}`);
  lines.push(`关键词：${topic.keywords.join(' / ')}`);
  lines.push('');
  lines.push('## 火爆原因');
  lines.push(`- 选题缺口：${topic.analysis.gap}`);
  lines.push(`- 文案钩子：${topic.analysis.hook}`);
  lines.push(`- 关键词与话题：${topic.analysis.keywords}`);
  lines.push(`- 形式与节奏：${topic.analysis.format}`);
  lines.push('');
  lines.push('## 原创思路');
  topic.ideas.forEach((idea, idx) => {
    lines.push(`### ${idx + 1}. ${idea.title}`);
    if (idea.altTitles.length) lines.push(`备选标题：${idea.altTitles.join(' / ')}`);
    lines.push('内容结构：');
    idea.structure.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push(`酒店切入点：${idea.hotelAngle}`);
    lines.push(`拍摄清单：${idea.shotList.join('；')}`);
    lines.push(`发布建议：${idea.publishTip}`);
  });
  return lines.join('\n');
}
