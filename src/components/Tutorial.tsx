import { useEffect, useState, type ReactNode } from 'react'
import { markTutorialSeen } from '../lib/tutorial'
import './Tutorial.css'

interface Step {
  title: string
  body: string
  /** 这一步要记住的按键，用键帽的样子排出来。 */
  keys?: string[]
  /** 这一步要讲清的功能点。和 `keys` 分开：键帽是「按什么」，这里是「能做什么」。 */
  points?: string[]
  art: ReactNode
}

const STEPS: Step[] = [
  {
    title: '先把视频铺成方格',
    body: '点「选择目录」挑一个文件夹，里面的视频会按名字铺成方格墙。想从 C 盘、D 盘一路点进去也行：目录条最前面那个入口能带你到「此电脑」。',
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4.5" y="5.5" width="10" height="8" rx="2" />
        <rect x="17.5" y="5.5" width="10" height="8" rx="2" />
        <rect x="4.5" y="17.5" width="10" height="8" rx="2" />
        <rect x="17.5" y="17.5" width="10" height="8" rx="2" />
      </svg>
    ),
  },
  {
    title: '点一下方格就放大播放',
    body: '点任意一格，它会放大成铺满窗口的画面，其余方格往下让位。看画面时点一下是播放/暂停，双击左半屏快退 10 秒、右半屏快进 10 秒。',
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4.5" y="7.5" width="23" height="17" rx="3" />
        <path d="M13.5 12.5l7 4.5-7 4.5z" />
      </svg>
    ),
  },
  {
    title: '底部的灵动岛',
    body: '播放、进度、音量、倍速、全屏、上下集，都在这条常驻控制条里。鼠标不动几秒它会自己藏起来，动一下又回来。',
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3.5" y="11.5" width="25" height="10" rx="5" />
        <path d="M11 14.5l5 3.5-5 3.5z" />
        <path d="M20 16.5h5" />
      </svg>
    ),
  },
  {
    title: '音轨、字幕在这里换',
    body: '灵动岛上的「音轨与字幕」把播放中要调的东西收在一处，分音频、字幕两页。',
    points: [
      '音频页：换音轨、挑输出设备、切声道、调音频延迟，也能加载外挂音轨',
      '字幕页：点「加载字幕文件…」挂外挂字幕，选中的那条立刻生效；第二字幕可以拿来放双语',
      '字幕快了慢了用延迟调，字号和位置也在这一页',
      '选过的音轨和字幕会跟着这个视频记住，下次打开还是它',
    ],
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 10.5h20M6 21.5h20" />
        <circle cx="12" cy="10.5" r="3" />
        <circle cx="21" cy="21.5" r="3" />
      </svg>
    ),
  },
  {
    title: '键盘也能用',
    body: '焦点在画面上时这些键都生效，不用去点控件。',
    keys: ['空格 播放暂停', '← → 5 秒', 'J L 10 秒', '↑ ↓ 音量', 'M 静音', 'F 全屏', '[ ] 倍速'],
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3.5" y="9.5" width="25" height="14" rx="3" />
        <path d="M8 14h2M13 14h2M18 14h2M23 14h1M10 19h12" />
      </svg>
    ),
  },
]

export interface TutorialProps {
  onClose: () => void
}

/**
 * 首次进入的用法教程。
 *
 * 用分步卡片而不是「高亮页面上某个按钮」的引导：第一次打开时方格墙和灵动岛
 * 都还没出现，没有东西可以指。
 */
export default function Tutorial({ onClose }: TutorialProps) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const close = () => {
    // 看过一次就不再自动弹；以后想再看，标题栏右边那个「?」随时能打开
    markTutorialSeen()
    onClose()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div
      className="tutorial"
      data-testid="tutorial"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="tutorial__backdrop" onClick={close} />

      <div className="tutorial__panel">
        <button className="tutorial__close" type="button" onClick={close} aria-label="关闭教程">
          ✕
        </button>

        {/* key 换掉才会重播入场动画，翻页才有「换了一屏」的感觉 */}
        <div className="tutorial__step" key={index}>
          <span className="tutorial__art">{step.art}</span>
          <h2 className="tutorial__title" id="tutorial-title">
            {step.title}
          </h2>
          <p className="tutorial__body">{step.body}</p>

          {step.keys === undefined ? null : (
            <ul className="tutorial__keys">
              {step.keys.map((key) => (
                <li className="tutorial__key" key={key}>
                  {key}
                </li>
              ))}
            </ul>
          )}

          {step.points === undefined ? null : (
            <ul className="tutorial__points">
              {step.points.map((point) => (
                <li className="tutorial__point" key={point}>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tutorial__foot">
          <span className="tutorial__dots" aria-hidden="true">
            {STEPS.map((item, dot) => (
              <span
                className="tutorial__dot"
                key={item.title}
                data-active={dot === index ? 'true' : 'false'}
              />
            ))}
          </span>

          <span className="tutorial__actions">
            {index === 0 ? null : (
              <button
                className="button"
                type="button"
                onClick={() => setIndex((current) => current - 1)}
              >
                上一步
              </button>
            )}
            <button
              className="button button--primary"
              type="button"
              onClick={() => (last ? close() : setIndex((current) => current + 1))}
            >
              {last ? '开始使用' : '下一步'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
