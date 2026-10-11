import { describe, expect, it } from 'vitest'
import { fileName } from './path'

describe('fileName', () => {
  it('取出 Windows 路径的文件名', () => {
    expect(fileName(String.raw`E:\clips\demo.mp4`)).toBe('demo.mp4')
  })

  it('取出 POSIX 路径的文件名', () => {
    expect(fileName('/home/user/demo.mkv')).toBe('demo.mkv')
  })

  it('路径本身就是文件名时原样返回', () => {
    expect(fileName('demo.webm')).toBe('demo.webm')
  })

  it('以分隔符结尾时忽略空段', () => {
    expect(fileName('E:/clips/')).toBe('clips')
  })

  it('空字符串原样返回', () => {
    expect(fileName('')).toBe('')
  })
})
