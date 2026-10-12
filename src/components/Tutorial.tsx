import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { markTutorialSeen } from '../lib/tutorial'
import './Tutorial.css'

/** 教程要盯着的那几件事，由 App 传进来。 */
export interface TutorialProgress {
  /** 已经选过目录（或者在「此电脑」里）。 */
  hasDirectory: boolean
  /** 方格墙上有视频。 */
  hasVideos: boolean
  /** 有视频正在播放。 */
  hasMedia: boolean
  /**
   * 用户已经点过方格（不管后来有没有真的播起来）。
   *
   * 第二步只认这个：点下去的时候播放内核可能还要一秒多才把画面挂上，
   * 拿「已经在播」当判据的话，用户点完什么反馈都没有，只能去按跳过。
   */
  openedVideo: boolean
}

interface Step {
  title: string
  body: string
  /** 这一步要记住的按键，用键帽的样子排出来。 */
  keys?: string[]
  /** 这一步要讲清的功能点。和 `keys` 分开：键帽是「按什么」，这里是「能做什么」。 */
  points?: string[]
  art: ReactNode
  /**
   * 要打光的那块界面的选择器。
   *
   * 找不到就退回居中的卡片——教程不该因为用户跳过了上一步就卡住。
   */
  target?: string
  /** 做到这件事就自动翻页。 */
  done?: (progress: TutorialProgress) => boolean
  /** 等操作时给一句提示。 */
  waitHint?: string
}

const STEPS: Step[] = [
  {
    title: '先看一段自带的示例',
    body: '点「看示例视频」，它会打开随应用带来的一小段片段（还带一条字幕），不用自己先去找片子。',
    target: '.library__sample',
    done: (progress) => progress.hasDirectory,
    waitHint: '点一下就会自动继续',
    points: [
      '看完想换成自己的视频，点旁边的「选择目录」，或者直接进「此电脑」翻盘',
      '示例文件会复制到本机的应用数据目录里，改坏了删掉重进就行',
    ],
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
    title: '点一格，放大播放',
    body: '点任意一个方格，它会放大成铺满窗口的画面并开始播放；再看画面时点一下是播放/暂停，双击左半屏快退 10 秒、右半屏快进 10 秒。',
    target: '.grid .tile:not(.tile--expanded)',
    done: (progress) => progress.openedVideo,
    waitHint: '点一下方格就会自动继续',
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
    target: '.island',
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
    target: '.island__media',
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
    title: '右上角是设置',
    body: '均衡器、响度归一化这些不用天天动的东西收在这里，点右上角的齿轮打开。',
    target: '.app__tool',
    points: [
      '简单模式：响度归一化、虚拟环绕、立体声扩展，三个开关搞定',
      '高级模式：10 段均衡器 + 预设（音乐 / 电影 / 夜间 / 人声），还有输出采样率、位深和透传',
      '设置存在本机，下次打开还是这样',
    ],
    art: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="4.5" />
        <path d="M16 4.5v3M16 24.5v3M4.5 16h3M24.5 16h3M8 8l2 2M22 22l2 2M24 8l-2 2M10 22l-2 2" />
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
  /** 界面现在到哪一步了，用来判断用户有没有真的做出来。 */
  progress: TutorialProgress
}

/**
 * 首次进入的交互教程。
 *
 * 和「高亮某个按钮然后只让你点下一步」的引导不同，这里是**真的让用户去点**：
 * 要打光的那块界面直接从页面上量出位置，浮层本身不吃点击事件（只有提示卡片吃），
 * 所以被指到的按钮是可以真的按下去的；做完那件事（比如目录选好了）就自动翻到下一屏。
 *
 * 教程不该把人困住：等操作的那一屏永远给一个「跳过这步」，找不到目标元素时
 * 就退回居中的卡片，宁可少教一点，也不能让人卡在这里。
 */
export default function Tutorial({ onClose, progress }: TutorialProps) {
  const [index, setIndex] = useState(0)
  /**
   * 打开时的状态。
   *
   * 「已经会了」的步骤不该再拦着用户：从标题栏的「?」重新打开教程时，
   * 目录早选好了，这时第一步就该直接放行，而不是让用户再选一次。
   */
  const [started] = useState(progress)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const close = () => {
    // 看过一次就不再自动弹；以后想再看，标题栏那个「?」随时能打开
    markTutorialSeen()
    onClose()
  }

  const satisfiedAtStart = step.done !== undefined && step.done(started)
  const waiting = step.done !== undefined && !satisfiedAtStart && !step.done(progress)

  // 用户真的做出来了就自己翻页
  useEffect(() => {
    if (step.done === undefined || satisfiedAtStart || last) {
      return
    }

    if (step.done(progress)) {
      setIndex((current) => current + 1)
    }
  }, [last, progress, satisfiedAtStart, step])

  // 量出要高亮的那块界面。布局会动（缩略图到达、方格 FLIP），所以隔一会儿重测一次
  useLayoutEffect(() => {
    const selector = step.target

    // 这一步没有要打光的元素（比如最后的快捷键），什么都不用量
    if (selector === undefined) {
      return
    }

    const measure = () => {
      const element = document.querySelector(selector)
      setRect(element === null ? null : element.getBoundingClientRect())
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }

    // 立刻量一次，免得第一帧还停在上一屏的位置上
    measure()

    const timer = window.setInterval(measure, 350)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  /**
   * 现在该打光的那块。
   *
   * 用 step 自己的目标判断，而不是只看量出来的结果：从「有目标」翻到「没目标」
   * 的那一步时，得立刻别再用上一屏量到的位置。
   */
  const spotlightRect = step.target === undefined ? null : rect

  /** 打光框：四周铺满阴影，中间留一个洞，看起来就是「这块是重点」。 */
  const spotlight = useMemo(() => {
    if (spotlightRect === null) {
      return null
    }

    const padding = 6

    const style: CSSProperties = {
      left: spotlightRect.left - padding,
      top: spotlightRect.top - padding,
      width: spotlightRect.width + padding * 2,
      height: spotlightRect.height + padding * 2,
    }

    return <div className="tutorial__spotlight" style={style} data-testid="tutorial-spotlight" />
  }, [spotlightRect])

  /**
   * 提示卡片的位置：贴在高亮块旁边，空间不够就换一边。
   *
   * 卡片要躲开高亮块，不然会挡住用户要点的那颗按钮。
   */
  const coachStyle = useMemo<CSSProperties | null>(() => {
    if (spotlightRect === null) {
      return null
    }

    const half = Math.min(230, viewport.width / 2 - 16)
    const left = Math.min(
      Math.max(spotlightRect.left + spotlightRect.width / 2, half + 16),
      viewport.width - half - 16,
    )
    const below = spotlightRect.bottom < viewport.height - 300

    return below
      ? { top: spotlightRect.bottom + 18, left }
      : { bottom: viewport.height - spotlightRect.top + 18, left }
  }, [spotlightRect, viewport])

  const panel = (
    <>
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

      {waiting && step.waitHint !== undefined ? (
        <p className="tutorial__wait" data-testid="tutorial-wait">
          {step.waitHint}
        </p>
      ) : null}

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

          {waiting ? (
            <button
              className="button"
              type="button"
              onClick={() => (last ? close() : setIndex((current) => current + 1))}
            >
              跳过这步
            </button>
          ) : null}

          <button
            className="button button--primary"
            type="button"
            disabled={waiting}
            onClick={() => (last ? close() : setIndex((current) => current + 1))}
          >
            {waiting ? '等你操作' : last ? '开始使用' : '下一步'}
          </button>
        </span>
      </div>
    </>
  )

  /*
   * 有目标时不再铺满整层的遮罩：打光框自己的阴影就是那层暗，而且整层浮层
   * 不吃点击事件，用户才能按到被指的那颗按钮。没有目标时退回居中卡片那套。
   */
  return (
    <div
      className="tutorial"
      data-testid="tutorial"
      data-coach={spotlightRect !== null ? 'true' : 'false'}
      role="dialog"
      aria-modal={spotlightRect === null ? 'true' : undefined}
      aria-labelledby="tutorial-title"
    >
      {/*
        等用户操作的那一屏，底衬不能吃点击——它只是压暗，用户要点的东西在它下面。
        （真机上踩过：目标一时找不到时，这层会把整页的点击都吞掉，只剩「跳过这步」能按。）
      */}
      {spotlightRect === null ? (
        <div
          className="tutorial__backdrop"
          data-pass-through={waiting ? 'true' : undefined}
          onClick={close}
        />
      ) : null}

      {spotlight}

      <div
        className={spotlightRect === null ? 'tutorial__panel' : 'tutorial__coach'}
        style={coachStyle ?? undefined}
      >
        {panel}
      </div>
    </div>
  )
}
