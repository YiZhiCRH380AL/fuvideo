import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { getAudioSpectrum } from '../lib/backend'

export interface AudioSpectrumProps {
  frequencies: number[]
  active: boolean
}

const POLL_MS = 120

function formatBand(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

/** 均衡器上方的实时频谱。只在本节可见时轮询，避免一直占着音频回环。 */
export default function AudioSpectrum({ frequencies, active }: AudioSpectrumProps) {
  const [levels, setLevels] = useState<number[]>(() => frequencies.map(() => 0))
  const [unavailable, setUnavailable] = useState(false)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || typeof IntersectionObserver === 'undefined') {
      return
    }

    const node = rootRef.current
    if (node === null) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: 0.05 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [active])

  useEffect(() => {
    if (!active || !visible) {
      return
    }

    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      try {
        const spectrum = await getAudioSpectrum()

        if (!cancelled && spectrum !== null && Array.isArray(spectrum.levels)) {
          setLevels(
            frequencies.map((_, index) =>
              Math.min(1, Math.max(0, spectrum.levels[index] ?? 0)),
            ),
          )
          setUnavailable(false)
        }
      } catch {
        if (!cancelled) {
          setUnavailable(true)
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => void poll(), POLL_MS)
        }
      }
    }

    void poll()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [active, frequencies, visible])

  return (
    <div className="spectrum" data-testid="audio-spectrum" ref={rootRef}>
      <div className="spectrum__head">
        <span>实时频段</span>
        <small>{unavailable ? '音频回环不可用' : '跟随播放设备'}</small>
      </div>

      <div
        className="spectrum__bars"
        role="img"
        aria-label={unavailable ? '实时音频频谱不可用' : '实时音频频谱'}
      >
        {frequencies.map((frequency, index) => (
          <span className="spectrum__band" key={frequency}>
            <span
              className="spectrum__bar"
              style={{ '--level': `${(levels[index] ?? 0) * 100}%` } as CSSProperties}
            />
            <small>{formatBand(frequency)}</small>
          </span>
        ))}
      </div>
    </div>
  )
}
