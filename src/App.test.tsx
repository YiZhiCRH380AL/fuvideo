import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('渲染应用名与初始时间显示', () => {
    render(<App />)

    expect(screen.getByText('futurevideo')).toBeInTheDocument()
    expect(screen.getByTestId('time-display')).toHaveTextContent('0:00 / 0:00')
  })

  it('浏览器环境下提示需要桌面应用，并禁用打开按钮', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('backend-status')).toHaveTextContent('浏览器')
    })

    expect(screen.getByRole('button', { name: '选择视频文件' })).toBeDisabled()
    expect(document.documentElement.dataset.shell).toBe('browser')
  })
})
