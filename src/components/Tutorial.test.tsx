import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasSeenTutorial } from '../lib/tutorial'
import Tutorial, { type TutorialProgress } from './Tutorial'

/** 什么都没做过的状态。 */
const NOTHING: TutorialProgress = {
  hasDirectory: false,
  hasVideos: false,
  hasMedia: false,
  openedVideo: false,
}
/** 目录已经打开、视频也放起来了。 */
const PLAYING: TutorialProgress = {
  hasDirectory: true,
  hasVideos: true,
  hasMedia: true,
  openedVideo: true,
}

/**
 * 教程是从页面上量打光位置的，所以测试里得先把目标元素挂上。
 *
 * 目标靠 `data-tutorial` 钩子找，不靠样式类——类名是共用的，会打到别人身上。
 */
function mountTarget(name: string, className: string): HTMLElement {
  const element = document.createElement('button')
  element.className = className
  element.dataset.tutorial = name

  document.body.appendChild(element)
  return element
}

/** 第一步打光的是空状态里的「看示例视频」。 */
function mountSampleEntry(): HTMLElement {
  return mountTarget('sample', 'library__sample')
}

function renderTutorial(progress: TutorialProgress = NOTHING) {
  const onClose = vi.fn()
  const view = render(<Tutorial onClose={onClose} progress={progress} />)

  return { onClose, view }
}

/**
 * 一路点到最后一屏。
 *
 * 等操作的步骤主按钮是灰的，得走「跳过这步」，所以这里两个都认。
 */
async function goToLastStep(): Promise<void> {
  while (screen.queryByRole('button', { name: '开始使用' }) === null) {
    const skip = screen.queryByRole('button', { name: '跳过这步' })
    await userEvent.click(skip ?? screen.getByRole('button', { name: '下一步' }))
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  // 打光目标是直接挂在 document 上的，用例之间要清干净
  document.body.innerHTML = ''
})

describe('交互教程', () => {
  it('第一步真的指向「看示例视频」，并等用户去点', async () => {
    mountSampleEntry()
    renderTutorial()

    expect(screen.getByTestId('tutorial-spotlight')).toBeInTheDocument()
    expect(screen.getByText('先看一段自带的示例')).toBeInTheDocument()

    // 空转的主按钮 + 一个跳出口，用户不能被卡在这儿
    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '跳过这步' })).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-wait')).toHaveTextContent('点一下就会自动继续')
  })

  it('打开示例目录之后自己翻到第二步', async () => {
    mountSampleEntry()
    const { view } = renderTutorial()

    expect(screen.getByText('先看一段自带的示例')).toBeInTheDocument()

    view.rerender(<Tutorial onClose={vi.fn()} progress={{ ...NOTHING, hasDirectory: true }} />)

    await waitFor(() => expect(screen.getByText('左侧栏是你的控制台')).toBeInTheDocument())
  })

  it('重新打开教程时，已经做到过的步骤不再拦人', async () => {
    // 目录早打开了：这一步不该再用「等你操作」把人拦住
    mountSampleEntry()

    renderTutorial({ ...PLAYING, hasMedia: false })

    expect(screen.getByText('先看一段自带的示例')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跳过这步' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('找不到打光目标时退回居中的卡片，而不是卡住', async () => {
    // 一个目标元素都没挂：没有东西可以打光
    renderTutorial({ ...PLAYING, hasVideos: false, hasMedia: false })

    expect(screen.getByText('先看一段自带的示例')).toBeInTheDocument()
    expect(screen.queryByTestId('tutorial-spotlight')).not.toBeInTheDocument()
    // 退回居中的卡片，而且主按钮可用，用户能继续往下走
    expect(screen.getByTestId('tutorial')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('点「跳过这步」能继续往下走', async () => {
    mountSampleEntry()
    renderTutorial()

    await userEvent.click(screen.getByRole('button', { name: '跳过这步' }))

    await waitFor(() => expect(screen.getByText('左侧栏是你的控制台')).toBeInTheDocument())
  })

  /**
   * 真机上踩过：第二步的目标一时找不到（方格还没铺出来），底衬就把整页的点击吞了，
   * 用户点方格没反应，只能按「跳过这步」。等操作的那一屏，底衬必须让点击穿过去。
   */
  it('等操作时底衬不吃点击，用户的点击能落到页面上', async () => {
    const tile = mountTarget('tile', 'tile')
    const clicked = vi.fn()
    tile.addEventListener('click', clicked)

    // 什么都不满足：第一步在等操作，同时页面上没有它的目标元素
    renderTutorial()

    const backdrop = document.querySelector('.tutorial__backdrop')
    expect(backdrop).toHaveAttribute('data-pass-through', 'true')

    await userEvent.click(tile)

    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('一步步做下去：先等看示例，再等点方格，最后不再拦人', async () => {
    mountSampleEntry()
    const { view } = renderTutorial()

    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()

    // 示例目录打开了 → 自己进第二步，继续等着点方格
    view.rerender(
      <Tutorial onClose={vi.fn()} progress={{ ...NOTHING, hasDirectory: true, hasVideos: true }} />,
    )
    await waitFor(() => expect(screen.getByText('左侧栏是你的控制台')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('点一格，放大播放')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()

    // 视频放起来了 → 进入片库入口说明，不用动手也能继续
    view.rerender(<Tutorial onClose={vi.fn()} progress={PLAYING} />)

    await waitFor(() => expect(screen.getByText('右边缘打开播放片库')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('最后一屏是快捷键和「开始使用」，走完记下看过', async () => {
    const { onClose } = renderTutorial()

    await goToLastStep()

    expect(screen.getByText('键盘也能用')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '开始使用' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })

  it('按 Esc 关掉也算看过一次', async () => {
    const { onClose } = renderTutorial()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })

  it('右上角可以直接关掉', async () => {
    const { onClose } = renderTutorial()

    await userEvent.click(screen.getByRole('button', { name: '关闭教程' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })

  it('讲到了音轨、字幕和设置页', async () => {
    renderTutorial()

    await goToLastStep()

    // 最后一步是快捷键，往前依次是设置、整理入口和音轨字幕
    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('左侧栏是设置')).toBeInTheDocument()
    // 正文里也提到了「均衡器」，这里断言只属于功能点那一行的文字
    expect(screen.getByText(/10 段均衡器/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('整理与播放工具分工')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('音轨、字幕在这里换')).toBeInTheDocument()
    expect(screen.getByText(/加载字幕文件/)).toBeInTheDocument()
  })
})
