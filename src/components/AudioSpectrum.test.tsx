import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAudioSpectrum: vi.fn(),
}))

vi.mock('../lib/backend', () => ({
  getAudioSpectrum: () => mocks.getAudioSpectrum(),
}))

import AudioSpectrum from './AudioSpectrum'

describe('实时音频频谱', () => {
  beforeEach(() => {
    mocks.getAudioSpectrum.mockReset()
    mocks.getAudioSpectrum.mockResolvedValue({
      frequencies: [31, 500, 4000],
      levels: [0.18, 0.66, 0.34],
    })
  })

  it('把后端回环能量映射到每个频段', async () => {
    render(<AudioSpectrum frequencies={[31, 500, 4000]} active />)

    expect(screen.getByRole('img', { name: '实时音频频谱' })).toBeInTheDocument()
    const bars = document.querySelectorAll<HTMLElement>('.spectrum__bar')

    await waitFor(() => expect(bars[1]).toHaveStyle({ '--level': '66%' }))
    expect(screen.getByText('31')).toBeInTheDocument()
    expect(screen.getByText('4k')).toBeInTheDocument()
  })

  it('不可用时保留频段骨架并给出说明', async () => {
    mocks.getAudioSpectrum.mockRejectedValue(new Error('no device'))
    render(<AudioSpectrum frequencies={[31, 500, 4000]} active />)

    await waitFor(() =>
      expect(screen.getByRole('img', { name: '实时音频频谱不可用' })).toBeInTheDocument(),
    )
    expect(screen.getByText('音频回环不可用')).toBeInTheDocument()
  })
})
