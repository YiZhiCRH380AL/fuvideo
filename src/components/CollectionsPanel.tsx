import { useEffect, useState } from 'react'
import type { OptionChoice } from '../lib/backend'
import { fileName, parentDirectory } from '../lib/path'
import { cachedThumbnail, loadThumbnail } from '../lib/thumbnail-cache'

export type CollectionKind = 'playlist' | 'favorites'

export interface CollectionsPanelProps {
  kind: CollectionKind
  paths: string[]
  /** 播放模式（只有播放列表用得上）。 */
  modes: OptionChoice[]
  mode: string
  onPickMode: (mode: string) => void
  /** 点文件名：放这个视频。 */
  onPlay: (path: string) => void
  /** 从列表里移出。 */
  onRemove: (path: string) => void
  /** 播放列表用：在列表里挪一格。 */
  onShift: (path: string, delta: number) => void
  /** 收藏夹用：跳到这个视频所在的目录，并把那一格高亮出来。 */
  onReveal: (path: string) => void
}

const TITLES: Record<CollectionKind, string> = {
  playlist: '播放列表',
  favorites: '收藏夹',
}

const EMPTY: Record<CollectionKind, string> = {
  playlist: '列表是空的。鼠标移到方格上，点右上角那颗 ≡ 加进来，看完一个会自动播下一个。',
  favorites: '还没有收藏。鼠标移到方格上，点右上角那颗 ☆ 收进来。',
}

/**
 * 播放列表 / 收藏夹的面板。
 *
 * 两个列表长得几乎一样，差别只有两处：播放列表能调顺序（看完自动播下一个，
 * 所以顺序就是播放顺序），收藏夹多一行「所在目录」的小字用来跳回去。
 */
export default function CollectionsPanel({
  kind,
  paths,
  modes,
  mode,
  onPickMode,
  onPlay,
  onRemove,
  onShift,
  onReveal,
}: CollectionsPanelProps) {
  /** 每一行的封面首帧。抓到一张补一张，抓不到就留一块空底。 */
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      for (const path of paths) {
        if (cancelled) {
          return
        }

        if (cachedThumbnail(path) !== undefined) {
          continue
        }

        // 一次只抓一张：抓帧是串行的，一起发出去只会互相排队
        const image = await loadThumbnail(path)

        if (!cancelled && image !== null) {
          setThumbs((previous) => ({ ...previous, [path]: image }))
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [paths])

  /**
   * 这一行的封面。
   *
   * 先看自己的 state，再看共用缓存：方格墙上可能已经抓过这一帧了，
   * 缓存里有就直接画出来，不用再等一次抓取。
   */
  const thumbFor = (path: string): string | undefined => thumbs[path] ?? cachedThumbnail(path)

  if (paths.length === 0) {
    return (
      <>
        {kind === 'playlist' ? <ModeRow modes={modes} mode={mode} onPick={onPickMode} /> : null}
        <p className="paths__empty" data-testid={`${kind}-empty`}>
          {EMPTY[kind]}
        </p>
      </>
    )
  }

  return (
    <>
      {kind === 'playlist' ? <ModeRow modes={modes} mode={mode} onPick={onPickMode} /> : null}

      <ul className="paths" data-testid={`${kind}-list`}>
      {paths.map((path, index) => (
        <li className="paths__item" key={path}>
          <div className="paths__row">
            <span className="paths__thumb" aria-hidden="true">
              {thumbFor(path) === undefined ? null : <img src={thumbFor(path)} alt="" />}
            </span>

            <button className="paths__name" type="button" title={path} onClick={() => onPlay(path)}>
              {fileName(path)}
            </button>

            {kind === 'playlist' ? (
              <span className="paths__tools">
                <button
                  className="paths__tool"
                  type="button"
                  disabled={index === 0}
                  aria-label={`把 ${fileName(path)} 上移`}
                  title="上移"
                  onClick={() => onShift(path, -1)}
                >
                  ↑
                </button>
                <button
                  className="paths__tool"
                  type="button"
                  disabled={index === paths.length - 1}
                  aria-label={`把 ${fileName(path)} 下移`}
                  title="下移"
                  onClick={() => onShift(path, 1)}
                >
                  ↓
                </button>
              </span>
            ) : null}

            <button
              className="paths__tool"
              type="button"
              aria-label={`把 ${fileName(path)} 从${TITLES[kind]}移出`}
              title={`从${TITLES[kind]}移出`}
              onClick={() => onRemove(path)}
            >
              ✕
            </button>
          </div>

          {/*
            收藏夹里的那行小字：点它不是播放，而是跳回**文件所在的目录**并把这一格高亮出来。
            文件名点了是播放——两件事分开，用户才找得回原处。
          */}
          {kind === 'favorites' ? (
            <button
              className="paths__where"
              type="button"
              title={`跳到 ${parentDirectory(path)}`}
              aria-label={`跳到 ${parentDirectory(path)}`}
              onClick={() => onReveal(path)}
            >
              {parentDirectory(path) || '（没有目录信息）'}
            </button>
          ) : null}
        </li>
      ))}
      </ul>
    </>
  )
}

/** 播放模式那一排。顺序和随机本来就属于列表，所以摆在列表顶上。 */
function ModeRow({
  modes,
  mode,
  onPick,
}: {
  modes: OptionChoice[]
  mode: string
  onPick: (mode: string) => void
}) {
  return (
    <div className="paths__modes" role="group" aria-label="播放模式">
      {modes.map((item) => (
        <button
          className="paths__mode"
          key={item.id}
          type="button"
          aria-pressed={mode === item.id}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
