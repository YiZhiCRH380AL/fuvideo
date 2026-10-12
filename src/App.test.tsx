import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App（浏览器环境，走真实后端模块）', () => {
  it('渲染应用名与目录页提示', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.app__wordmark')).toHaveTextContent('FutureVideo')
    // 版本号挂在字标右下角，内容跟着 package.json 走
    expect(container.querySelector('.app__version')?.textContent).toMatch(/^\d+\.\d+/)
    expect(screen.getByText('选一个目录，把里面的视频铺成方格')).toBeInTheDocument()
  })

  it('启动先放开屏动画，环境探完后收场并卸载', async () => {
    render(<App />)

    // 第一帧就有开屏，底下的界面这时候还是隐着的
    expect(screen.getByTestId('splash')).toHaveAttribute('data-leaving', 'false')
    expect(document.querySelector('.app')).toHaveAttribute('data-splash', 'visible')

    await waitFor(() => expect(document.querySelector('.app')).toHaveAttribute('data-splash', 'done'), {
      timeout: 4000,
    })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })

  it('浏览器环境下选择目录不可用，并提示需要桌面应用', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('backend-status')).toHaveTextContent('浏览器')
    })

    expect(screen.getByRole('button', { name: '选择目录' })).toBeDisabled()
    expect(document.documentElement.dataset.shell).toBe('browser')
  })

  it('没有画面时窗口保持不透明，避免透出桌面', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.app')).toHaveAttribute('data-video', 'false')
  })
})
