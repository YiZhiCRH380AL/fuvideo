import { useCallback, useEffect, useState } from 'react'
import {
  addBookmark,
  clearRecent,
  forgetRecent,
  getBookmarks,
  getChapters,
  getLoopPoints,
  getRecent,
  removeBookmark,
  selectChapter,
  seekTo,
  setLoopA,
  setLoopB,
  type Bookmark,
  type ChapterInfo,
  type LoopPoints,
  type RecentEntry,
} from '../lib/backend'
import { fileName } from '../lib/path'
import { formatDuration, formatRelativeTime } from '../lib/time'

/** 定时到点之后干什么。 */
export type SleepAction = 'pause' | 'close'

export interface PlaybackToolsProps {
  /** 当前片子的路径；换了片要重读章节表与 AB 点。 */
  source: string | null
  /** 当前播放位置。用来「设 A / 设 B」——就是按下那一刻的位置。 */
  position: number
  /** 定时器还剩多少秒；`null` 表示没开。 */
  sleepRemaining: number | null
  /** 定时选的时长（分钟）；`null` 表示没开。 */
  sleepMinutes: number | null
  /** 定时到点之后干什么。 */
  sleepAction: SleepAction
  onSleepTimer: (minutes: number | null) => void
  onSleepAction: (action: SleepAction) => void
  miniMode: boolean
  alwaysOnTop: boolean
  onToggleMini: () => void
  onToggleAlwaysOnTop: () => void
  onOpenUrl: (url: string) => void
  /** 点一条最近播放：直接放那个文件（续播交给 watch-later）。 */
  onPlayRecent: (path: string) => void
  onError: (cause: unknown) => void
}

/** 定时的几个常用档。PotPlayer 也差不多是这几个数。 */
const SLEEP_MINUTES = [15, 30, 45, 60, 90]

const SLEEP_ACTIONS: { action: SleepAction; label: string }[] = [
  { action: 'pause', label: '暂停播放' },
  { action: 'close', label: '退出应用' },
]

/**
 * 播放工具面板：章节、AB 循环、定时、窗口行为、打开地址。
 *
 * 这些都「不属于某一格画面」，所以收在顶栏的一颗按钮里，而不是塞进灵动岛——
 * 灵动岛是随手要按的（暂停、进度、音量），这里是偶尔调一次的东西。
 *
 * 章节表与 AB 点是问 mpv 要的：读不到（没在播放、片子没章节）就老实显示空状态。
 */
export default function PlaybackTools({
  source,
  position,
  sleepRemaining,
  sleepMinutes,
  sleepAction,
  onSleepTimer,
  onSleepAction,
  miniMode,
  alwaysOnTop,
  onToggleMini,
  onToggleAlwaysOnTop,
  onOpenUrl,
  onPlayRecent,
  onError,
}: PlaybackToolsProps) {
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [loop, setLoop] = useState<LoopPoints>({ a: null, b: null })
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [url, setUrl] = useState('')

  /** 重读章节表与 AB 点。换片、跳章节、设端点之后都要来一次。 */
  const refresh = useCallback(async () => {
    if (source === null) {
      setChapters([])
      setLoop({ a: null, b: null })
      return
    }

    try {
      const [nextChapters, nextLoop] = await Promise.all([
        getChapters(),
        getLoopPoints(),
      ])

      // 后端没这个命令（比如浏览器里的假后端）只会返回 undefined，别把界面弄崩
      setChapters(Array.isArray(nextChapters) ? nextChapters : [])
      setLoop(nextLoop ?? { a: null, b: null })
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError, source])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** 最近播放是全局的，和当前片子无关；打开面板时拉一次就够。 */
  const loadRecent = useCallback(async () => {
    try {
      const next = await getRecent()

      // 假后端（浏览器 / e2e）对不认识的命令返回 null，别把界面弄崩
      setRecent(Array.isArray(next?.entries) ? next.entries : [])
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  /**
   * 书签是全局一份，界面上只摆当前这部片子的。
   *
   * 存在本机、按路径分组：换片之后不用重新读，过滤一下就行。
   */
  const loadBookmarks = useCallback(async () => {
    try {
      const next = await getBookmarks()

      setBookmarks(Array.isArray(next?.entries) ? next.entries : [])
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError])

  useEffect(() => {
    void loadBookmarks()
  }, [loadBookmarks])

  const mine = bookmarks.filter((bookmark) => bookmark.path === source)

  const markBookmark = useCallback(async () => {
    if (source === null) {
      return
    }

    try {
      const next = await addBookmark(source, Math.max(0, position))
      setBookmarks(Array.isArray(next?.entries) ? next.entries : [])
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError, position, source])

  const dropBookmark = useCallback(
    async (bookmark: Bookmark) => {
      try {
        const next = await removeBookmark(bookmark.path, bookmark.position)
        setBookmarks(Array.isArray(next?.entries) ? next.entries : [])
      } catch (cause: unknown) {
        onError(cause)
      }
    },
    [onError],
  )

  const jumpTo = useCallback(
    async (seconds: number) => {
      try {
        await seekTo(seconds)
      } catch (cause: unknown) {
        onError(cause)
      }
    },
    [onError],
  )

  const clear = useCallback(async () => {
    try {
      await clearRecent()
      setRecent([])
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError])

  /** 只去掉点名的那一条；别的记录不动。 */
  const forget = useCallback(
    async (path: string) => {
      try {
        const next = await forgetRecent(path)
        setRecent(Array.isArray(next?.entries) ? next.entries : [])
      } catch (cause: unknown) {
        onError(cause)
      }
    },
    [onError],
  )

  const jump = useCallback(
    async (index: number) => {
      try {
        await selectChapter(index)
        await refresh()
      } catch (cause: unknown) {
        onError(cause)
      }
    },
    [onError, refresh],
  )

  const mark = useCallback(
    async (which: 'a' | 'b') => {
      try {
        const seconds = Math.max(0, position)

        if (which === 'a') {
          await setLoopA(seconds)
        } else {
          await setLoopB(seconds)
        }

        await refresh()
      } catch (cause: unknown) {
        onError(cause)
      }
    },
    [onError, position, refresh],
  )

  const clearLoop = useCallback(async () => {
    try {
      await setLoopA(null)
      await setLoopB(null)
      await refresh()
    } catch (cause: unknown) {
      onError(cause)
    }
  }, [onError, refresh])

  return (
    <div className="tools" data-testid="playback-tools">
      <section className="tools__block">
        <div className="tools__head">
          <h4 className="tools__title">最近播放</h4>

          {recent.length === 0 ? null : (
            <button className="tools__link" type="button" onClick={() => void clear()}>
              清空
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="tools__hint" data-testid="tools-recent-empty">
            还没有记录。放过的片子会出现在这儿。
          </p>
        ) : (
          <ul className="tools__chapters tools__recent" data-testid="tools-recent">
            {recent.map((entry) => (
              <li className="tools__recent-row" key={entry.path}>
                <button
                  className="tools__chapter"
                  type="button"
                  title={`${entry.path}\n上次播放：${formatRelativeTime(entry.playedAt)}`}
                  onClick={() => onPlayRecent(entry.path)}
                >
                  <span className="tools__chapter-name">{fileName(entry.path)}</span>
                  <span className="tools__chapter-time">
                    {entry.position > 0 ? formatDuration(entry.position) : '从头'}
                  </span>
                </button>

                <button
                  className="tools__remove"
                  type="button"
                  aria-label={`从最近播放里去掉 ${fileName(entry.path)}`}
                  title="从最近播放里去掉"
                  onClick={() => void forget(entry.path)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tools__block">
        <h4 className="tools__title">章节</h4>

        {chapters.length === 0 ? (
          <p className="tools__hint" data-testid="tools-chapters-empty">
            {source === null ? '先放一个视频再看章节' : '这部片子没有章节信息'}
          </p>
        ) : (
          <ul className="tools__chapters">
            {chapters.map((chapter) => (
              <li key={chapter.index}>
                <button
                  className="tools__chapter"
                  type="button"
                  onClick={() => void jump(chapter.index)}
                >
                  <span className="tools__chapter-time">{formatDuration(chapter.time)}</span>
                  <span className="tools__chapter-name">
                    {chapter.title ?? `第 ${chapter.index + 1} 章`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tools__block">
        <div className="tools__head">
          <h4 className="tools__title">书签</h4>

          <button
            className="tools__link"
            type="button"
            disabled={source === null}
            onClick={() => void markBookmark()}
          >
            在 {formatDuration(position)} 加
          </button>
        </div>

        {mine.length === 0 ? (
          <p className="tools__hint" data-testid="tools-bookmarks-empty">
            {source === null ? '先放一个视频再加书签' : '这部片子还没有书签'}
          </p>
        ) : (
          <ul className="tools__chapters tools__recent" data-testid="tools-bookmarks">
            {mine.map((bookmark) => (
              <li className="tools__recent-row" key={bookmark.position}>
                <button
                  className="tools__chapter"
                  type="button"
                  title={`跳到 ${formatDuration(bookmark.position)}`}
                  onClick={() => void jumpTo(bookmark.position)}
                >
                  <span className="tools__chapter-name">{formatDuration(bookmark.position)}</span>
                </button>

                <button
                  className="tools__remove"
                  type="button"
                  aria-label={`去掉 ${formatDuration(bookmark.position)} 的书签`}
                  title="去掉这条书签"
                  onClick={() => void dropBookmark(bookmark)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tools__block">
        <h4 className="tools__title">AB 循环</h4>
        <p className="tools__hint">
          A 点 {loop.a === null ? '未设' : formatDuration(loop.a)} · B 点{' '}
          {loop.b === null ? '未设' : formatDuration(loop.b)}
        </p>

        <div className="tools__row">
          <button className="tools__action" type="button" onClick={() => void mark('a')} disabled={source === null}>
            设 A（当前位置）
          </button>
          <button className="tools__action" type="button" onClick={() => void mark('b')} disabled={source === null}>
            设 B（当前位置）
          </button>
          <button
            className="tools__action"
            type="button"
            onClick={() => void clearLoop()}
            disabled={loop.a === null && loop.b === null}
          >
            清除
          </button>
        </div>
      </section>

      <section className="tools__block">
        <h4 className="tools__title">定时</h4>

        <div className="tools__row" role="group" aria-label="定时时长">
          {/* 「关」摆在最前面：它和时长是同一个选择，放后面会单独挤到第二行 */}
          <button
            className="tools__chip"
            type="button"
            aria-label="关闭定时"
            aria-pressed={sleepMinutes === null}
            onClick={() => onSleepTimer(null)}
          >
            关
          </button>

          {SLEEP_MINUTES.map((minutes) => (
            <button
              className="tools__chip"
              key={minutes}
              type="button"
              onClick={() => onSleepTimer(minutes)}
              aria-pressed={sleepMinutes === minutes}
            >
              {minutes} 分
            </button>
          ))}
        </div>

        <div className="tools__row" role="group" aria-label="定时到点做什么">
          {SLEEP_ACTIONS.map((item) => (
            <button
              className="tools__chip"
              key={item.action}
              type="button"
              aria-pressed={sleepAction === item.action}
              onClick={() => onSleepAction(item.action)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="tools__hint" data-testid="tools-sleep">
          {sleepRemaining === null
            ? '到点之后自动动手，不看屏幕也不怕忘'
            : `还有 ${formatDuration(sleepRemaining)} 就${sleepAction === 'close' ? '退出' : '暂停'}`}
        </p>
      </section>

      <section className="tools__block">
        <h4 className="tools__title">窗口</h4>

        <label className="tools__toggle">
          <input type="checkbox" checked={alwaysOnTop} onChange={onToggleAlwaysOnTop} />
          <span>窗口置顶</span>
        </label>

        <label className="tools__toggle">
          <input type="checkbox" checked={miniMode} onChange={onToggleMini} />
          <span>迷你模式（缩成一小块，只看画面）</span>
        </label>
      </section>

      <section className="tools__block">
        <h4 className="tools__title">打开地址</h4>

        <form
          className="tools__row"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = url.trim()

            if (trimmed !== '') {
              onOpenUrl(trimmed)
              setUrl('')
            }
          }}
        >
          <input
            className="tools__input"
            type="text"
            value={url}
            placeholder="http://… 或本机文件路径"
            aria-label="视频地址"
            onChange={(event) => setUrl(event.target.value)}
          />
          <button className="tools__action" type="submit" disabled={url.trim() === ''}>
            打开
          </button>
        </form>
      </section>
    </div>
  )
}
