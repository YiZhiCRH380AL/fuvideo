import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasSeenTutorial } from '../lib/tutorial'
import Tutorial from './Tutorial'

beforeEach(() => {
  window.localStorage.clear()
})

/** 一路点到最后一屏。 */
async function goToLastStep(): Promise<void> {
  // 步数会随教程内容变，这里按按钮在不在来决定翻几页，不写死次数
  while (screen.queryByRole('button', { name: '下一步' }) !== null) {
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  }
}

describe('首次进入的教程', () => {
  it('第一屏讲选目录，最后一屏才是「开始使用」', async () => {
    render(<Tutorial onClose={vi.fn()} />)

    expect(screen.getByText('先把视频铺成方格')).toBeInTheDocument()
    // 第一屏没有上一步可回
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()

    await goToLastStep()

    expect(screen.getByText('键盘也能用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始使用' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
  })

  it('可以退回上一屏', async () => {
    render(<Tutorial onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('先把视频铺成方格')).toBeInTheDocument()
  })

  it('讲到音轨与外挂字幕怎么用', async () => {
    render(<Tutorial onClose={vi.fn()} />)

    // 最后一屏是快捷键，往前退一步就是音轨与字幕
    await goToLastStep()
    await userEvent.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('音轨、字幕在这里换')).toBeInTheDocument()
    expect(screen.getByText(/加载字幕文件/)).toBeInTheDocument()
    expect(screen.getByText(/会跟着这个视频记住/)).toBeInTheDocument()
  })

  it('走完一遍会记下看过，并让父组件卸载它', async () => {
    const onClose = vi.fn()
    render(<Tutorial onClose={onClose} />)

    await goToLastStep()
    await userEvent.click(screen.getByRole('button', { name: '开始使用' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })

  it('按 Esc 关掉也算看过一次', async () => {
    const onClose = vi.fn()
    render(<Tutorial onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })

  it('右上角可以直接关掉', async () => {
    const onClose = vi.fn()
    render(<Tutorial onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: '关闭教程' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTutorial()).toBe(true)
  })
})
