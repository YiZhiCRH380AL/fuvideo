import { describe, expect, it } from 'vitest'
import { fileName, pathSegments } from './path'

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

describe('pathSegments', () => {
  it('把盘符和每一层都拆出来，每层都带着可用的完整路径', () => {
    expect(pathSegments(String.raw`E:\clips\anime`)).toEqual([
      { name: 'E:', path: 'E:\\' },
      { name: 'clips', path: String.raw`E:\clips` },
      { name: 'anime', path: String.raw`E:\clips\anime` },
    ])
  })

  it('盘符根目录只有一段', () => {
    expect(pathSegments('E:\\')).toEqual([{ name: 'E:', path: 'E:\\' }])
  })

  it('混用分隔符与重复分隔符都能收敛', () => {
    expect(pathSegments('E:/clips//anime/')).toEqual([
      { name: 'E:', path: 'E:\\' },
      { name: 'clips', path: String.raw`E:\clips` },
      { name: 'anime', path: String.raw`E:\clips\anime` },
    ])
  })

  it('POSIX 绝对路径以根开头', () => {
    expect(pathSegments('/home/user')).toEqual([
      { name: '/', path: '/' },
      { name: 'home', path: '/home' },
      { name: 'user', path: '/home/user' },
    ])
  })

  it('只有一段时原样返回', () => {
    expect(pathSegments('anime')).toEqual([{ name: 'anime', path: 'anime' }])
  })

  it('空路径没有层级', () => {
    expect(pathSegments('   ')).toEqual([])
  })
})
