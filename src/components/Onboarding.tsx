import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBulb, IconCheckSquare, IconFlame, IconSpark } from './icons';

const KEY = 'hms-onboarded-v1';

/** 首次使用引导：3 步说明 + 演示数据知情 + 团队入口，可跳过且只出现一次。 */
export function Onboarding() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* 忽略 */
    }
    setOpen(false);
  };

  const steps = [
    {
      icon: <IconCheckSquare width={26} height={26} />,
      title: '每天的动作，勾掉就行',
      desc: '预置了「离店房态价格」「排房」两条固定任务；点一下复选框打卡，顶部进度和连续全勤会自动算。',
    },
    {
      icon: <IconBulb width={26} height={26} />,
      title: '选题不用自己刷',
      desc: '每天一批酒店相关爆款，逐条给出为什么火（文案、关键词、话题、形式）和可以直接开拍的原创思路。',
    },
    {
      icon: <IconFlame width={26} height={26} />,
      title: '热点直接改编',
      desc: '热榜每条附 3 套二创方案：分镜、口播、拍摄清单都有，复制给剪辑就能用。',
    },
  ];

  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/45 px-6 backdrop-blur-sm">
      <div className="w-full max-w-[360px] animate-rise-in rounded-3xl bg-paper p-5 shadow-float">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-ink-mute">
          <IconSpark width={14} height={14} className="text-clay-500" />
          当前为演示数据（文案自写、账号虚构）
        </div>
        <div className="mb-1 flex items-center justify-center gap-1.5 text-clay-500">{current.icon}</div>
        <h2 className="mt-2 text-center text-[18px] font-semibold leading-snug text-ink">{current.title}</h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-ink-soft">{current.desc}</p>

        <div className="mt-4 flex justify-center gap-1.5">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${idx === step ? 'w-5 bg-clay-500' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={close}
            className="btn-ghost flex-1"
          >
            跳过
          </button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="btn-primary flex-[1.4]">
              下一步
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                close();
                navigate('/plan');
              }}
              className="btn-primary flex-[1.4]"
            >
              开始使用
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            close();
            navigate('/settings');
          }}
          className="mt-3 w-full text-center text-[11.5px] text-ink-mute underline underline-offset-2"
        >
          我是团队成员，去「设置 → 团队协作」加入工作区
        </button>
      </div>
    </div>
  );
}
