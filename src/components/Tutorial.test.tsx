import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasSeenTutorial } from '../lib/tutorial'
import Tutorial, { type TutorialProgress } from './Tutorial'

/** 什么都没做过的状态。 */
const NOTHING: TutorialProgress = { hasDirectory: false, hasVideos: false, hasMedia: false }

/** 教程是从页面上量打光位置的，所以测试里得先把目标元素挂上。 */
function mountInto(parentClass: string, childClass: string): HTMLElement {
  const parent = document.createElement('div')
  parent.className = parentClass

  const child = document.createElement('button')
  child.className = childClass
  parent.appendChild(child)

  document.body.appendChild(parent)
  return child
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
  it('第一步真的指向「选择目录」，并等用户去点', async () => {
    mountInto('library__empty', 'button button--primary')
    renderTutorial()

    expect(screen.getByTestId('tutorial-spotlight')).toBeInTheDocument()
    expect(screen.getByText('先挑一个放视频的文件夹')).toBeInTheDocument()

    // 空转的主按钮 + 一个跳出口，用户不能被卡在这儿
    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '跳过这步' })).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-wait')).toHaveTextContent('选好目录就会自动继续')
  })

  it('选好目录之后自己翻到第二步', async () => {
    mountInto('library__empty', 'button button--primary')
    const { view } = renderTutorial()

    expect(screen.getByText('先挑一个放视频的文件夹')).toBeInTheDocument()

    view.rerender(<Tutorial onClose={vi.fn()} progress={{ ...NOTHING, hasDirectory: true }} />)

    await waitFor(() => expect(screen.getByText('点一格，放大播放')).toBeInTheDocument())
  })

  it('重新打开教程时，已经做到过的步骤不再拦人', async () => {
    // 目录早就选好了：这一步不该再用「等你操作」把人拦住
    mountInto('library__empty', 'button button--primary')

    renderTutorial({ hasDirectory: true, hasVideos: true, hasMedia: false })

    expect(screen.getByText('先挑一个放视频的文件夹')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跳过这步' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('找不到打光目标时退回居中的卡片，而不是卡住', async () => {
    // 一个目标元素都没挂：没有东西可以打光
    renderTutorial({ hasDirectory: true, hasVideos: false, hasMedia: false })

    expect(screen.getByText('先挑一个放视频的文件夹')).toBeInTheDocument()
    expect(screen.queryByTestId('tutorial-spotlight')).not.toBeInTheDocument()
    // 退回居中的卡片，而且主按钮可用，用户能继续往下走
    expect(screen.getByTestId('tutorial')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
  })

  it('点「跳过这步」能继续往下走', async () => {
    mountInto('library__empty', 'button button--primary')
    renderTutorial()

    await userEvent.click(screen.getByRole('button', { name: '跳过这步' }))

    await waitFor(() => expect(screen.getByText('点一格，放大播放')).toBeInTheDocument())
  })

  it('一步步做下去：先等选目录，再等点方格，最后不再拦人', async () => {
    mountInto('library__empty', 'button button--primary')
    const { view } = renderTutorial()

    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()

    // 目录选好了 → 自己进第二步，继续等着点方格
    view.rerender(
      <Tutorial onClose={vi.fn()} progress={{ ...NOTHING, hasDirectory: true, hasVideos: true }} />,
    )
    await waitFor(() => expect(screen.getByText('点一格，放大播放')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '等你操作' })).toBeDisabled()

    // 视频放起来了 → 第三步不用动手，按钮就能点
    view.rerender(
      <Tutorial onClose={vi.fn()} progress={{ hasDirectory: true, hasVideos: true, hasMedia: true }} />,
    )

    await waitFor(() => expect(screen.getByText('底部的灵动岛')).toBeInTheDocument())
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

    // 最后一步是快捷键，往前退两步分别是设置页和音轨字幕
    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('右上角是设置')).toBeInTheDocument()
    // 正文里也提到了「均衡器」，这里断言只属于功能点那一行的文字
    expect(screen.getByText(/10 段均衡器/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('音轨、字幕在这里换')).toBeInTheDocument()
    expect(screen.getByText(/加载字幕文件/)).toBeInTheDocument()
  })
})
