import { describe, expect, it } from 'vitest'
import type { TrackInfo } from './backend'
import {
  DELAY_LIMIT,
  formatDelay,
  formatStep,
  languageLabel,
  stepDelay,
  stepNumber,
  trackDetail,
  trackTitle,
} from './media'

function track(overrides: Partial<TrackInfo> = {}): TrackInfo {
  return {
    id: 1,
    kind: 'audio',
    title: null,
    lang: null,
    codec: null,
    selected: false,
    external: false,
    default: false,
    ...overrides,
  }
}

describe('stepDelay', () => {
  it('按步长累加，且不留浮点尾巴', () => {
    expect(stepDelay(0, 0.1)).toBe(0.1)
    // 0.1 连加三次在浮点里是 0.30000000000000004
    expect(stepDelay(stepDelay(stepDelay(0, 0.1), 0.1), 0.1)).toBe(0.3)
  })

  it('夹在允许范围之内', () => {
    expect(stepDelay(DELAY_LIMIT, 0.5)).toBe(DELAY_LIMIT)
    expect(stepDelay(-DELAY_LIMIT, -0.5)).toBe(-DELAY_LIMIT)
  })

  it('坏值当成 0 处理', () => {
    expect(stepDelay(Number.NaN, 0.5)).toBe(0.5)
  })
})

describe('formatDelay', () => {
  it('非零带符号，零不带', () => {
    expect(formatDelay(0)).toBe('0.0s')
    expect(formatDelay(0.5)).toBe('+0.5s')
    expect(formatDelay(-1.2)).toBe('-1.2s')
  })

  it('坏值显示成 0.0s，而不是 NaN', () => {
    expect(formatDelay(Number.NaN)).toBe('0.0s')
  })
})

describe('formatStep', () => {
  it('正数带加号，负数自带减号，可以带单位', () => {
    expect(formatStep(0.1, 's')).toBe('+0.1s')
    expect(formatStep(-0.5, 's')).toBe('-0.5s')
    expect(formatStep(2)).toBe('+2')
  })
})

describe('languageLabel', () => {
  it('常见语言代码换成中文名，大小写不敏感', () => {
    expect(languageLabel('jpn')).toBe('日语')
    expect(languageLabel('ENG')).toBe('英语')
  })

  it('认不出来就原样显示，空值返回 null', () => {
    expect(languageLabel('xyz')).toBe('xyz')
    expect(languageLabel('   ')).toBeNull()
    expect(languageLabel(null)).toBeNull()
  })
})

describe('trackTitle', () => {
  it('优先用轨道自带的名字', () => {
    expect(trackTitle(track({ title: '导演评论' }), 0)).toBe('导演评论')
  })

  it('没有名字时用语言', () => {
    expect(trackTitle(track({ lang: 'jpn' }), 0)).toBe('日语')
  })

  it('都没有时用编号，字幕和音轨分别叫', () => {
    expect(trackTitle(track(), 1)).toBe('音轨 2')
    expect(trackTitle(track({ kind: 'sub' }), 0)).toBe('字幕 1')
  })
})

describe('trackDetail', () => {
  it('带上编码，外挂的另标出来', () => {
    expect(trackDetail(track({ codec: 'aac' }))).toBe('AAC')
    expect(trackDetail(track({ kind: 'sub', codec: 'subrip', external: true }))).toBe('SUBRIP · 外挂')
  })

  it('什么都没有时返回 null，列表里不留空位', () => {
    expect(trackDetail(track())).toBeNull()
  })
})

describe('stepNumber', () => {
  it('夹进区间', () => {
    expect(stepNumber(38, 2, 20, 120)).toBe(40)
    expect(stepNumber(120, 2, 20, 120)).toBe(120)
    expect(stepNumber(20, -2, 20, 120)).toBe(20)
  })
})
