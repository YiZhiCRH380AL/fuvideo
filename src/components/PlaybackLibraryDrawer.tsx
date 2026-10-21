import { useEffect, useState } from 'react'

import type { Collections, DirectoryListing } from '../lib/backend'
import { fileName } from '../lib/path'
import { cachedThumbnail, loadThumbnail } from '../lib/thumbnail-cache'
import './PlaybackLibraryDrawer.css'

export interface PlaybackLibraryDrawerProps {
  open: boolean
  source: DirectoryListing | null
  collections: Collections
  onClose: () => void
  onError: (cause: unknown) => void
  onChooseDirectory: () => Promise<DirectoryListing | null>
  onPlay: (path: string) => void
  onTogglePlaylist: (path: string) => Promise<void>
  onToggleFavorite: (path: string) => Promise<void>
  onToggleNamedCollection: (id: string, path: string) => Promise<void>
}

/** 播放页里的片库抽屉：选目录、看缩略图、直接加入列表或收藏夹。 */
export default function PlaybackLibraryDrawer({
  open,
  source,
  collections,
  onClose,
  onError,
  onChooseDirectory,
  onPlay,
  onTogglePlaylist,
  onToggleFavorite,
  onToggleNamedCollection,
}: PlaybackLibraryDrawerProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(source)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const customCollections = collections.customCollections ?? []

  useEffect(() => {
    if (open) {
      setListing(source)
      setNotice(null)
    }
  }, [open, source])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open || listing === null) {
      return
    }

    let cancelled = false
    const videos = listing.entries.filter((entry) => entry.kind === 'video')

    const run = async () => {
      for (const video of videos) {
        if (cancelled) {
          return
        }

        const cached = cachedThumbnail(video.path)
        if (cached !== undefined) {
          setThumbs((previous) => ({ ...previous, [video.path]: cached }))
          continue
        }

        const image = await loadThumbnail(video.path)
        if (!cancelled && image !== null) {
          setThumbs((previous) => ({ ...previous, [video.path]: image }))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [listing, open])

  if (!open) {
    return null
  }

  const videos = listing?.entries.filter((entry) => entry.kind === 'video') ?? []

  const chooseDirectory = async () => {
    setBusy('directory')
    try {
      const next = await onChooseDirectory()
      if (next !== null) {
        setListing(next)
      }
    } catch (cause: unknown) {
      onError(cause)
    } finally {
      setBusy(null)
    }
  }

  const add = async (kind: 'playlist' | 'favorite' | string, path: string) => {
    setBusy(path)
    try {
      if (kind === 'playlist') {
        await onTogglePlaylist(path)
        setNotice(`已更新播放列表 · ${fileName(path)}`)
      } else if (kind === 'favorite') {
        await onToggleFavorite(path)
        setNotice(`已更新快速收藏 · ${fileName(path)}`)
      } else {
        await onToggleNamedCollection(kind, path)
        const name = customCollections.find((item) => item.id === kind)?.name ?? '收藏夹'
        setNotice(`已更新「${name}」· ${fileName(path)}`)
      }
    } catch (cause: unknown) {
      onError(cause)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="playback-library" role="dialog" aria-modal="true" aria-label="播放片库">
      <button className="playback-library__backdrop" type="button" aria-label="关闭片库" onClick={onClose} />
      <aside className="playback-library__panel">
        <header className="playback-library__head">
          <div>
            <span>PLAYBACK LIBRARY</span>
            <h2>播放中的片库</h2>
          </div>
          <button type="button" className="playback-library__close" aria-label="关闭片库面板" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="playback-library__directory">
          <div>
            <small>当前目录</small>
            <strong title={listing?.directory}>{listing?.directory ?? '还没有选择目录'}</strong>
          </div>
          <button type="button" onClick={() => void chooseDirectory()} disabled={busy !== null}>
            {busy === 'directory' ? '读取中…' : '选择目录'}
          </button>
        </div>

        {notice === null ? null : <p className="playback-library__notice">{notice}</p>}

        {videos.length === 0 ? (
          <div className="playback-library__empty">
            <span aria-hidden="true">▦</span>
            <strong>这个目录里没有视频</strong>
            <p>选一个目录，缩略图会出现在这里。</p>
          </div>
        ) : (
          <ul className="playback-library__grid">
            {videos.map((video) => {
              const inPlaylist = collections.playlist.includes(video.path)
              const favorite = collections.favorites.includes(video.path)

              return (
                <li className="playback-library__card" key={video.path}>
                  <button
                    className="playback-library__thumb"
                    type="button"
                    aria-label={`播放 ${video.name}`}
                    title={`播放 ${video.name}`}
                    onClick={() => onPlay(video.path)}
                  >
                    {thumbs[video.path] === undefined ? <span>FU</span> : <img src={thumbs[video.path]} alt="" />}
                    <span aria-hidden="true">▶</span>
                  </button>
                  <div className="playback-library__copy">
                    <strong title={video.name}>{video.name}</strong>
                    <span>{video.name.split('.').at(-1)?.toUpperCase()}</span>
                  </div>
                  <div className="playback-library__actions">
                    <button
                      type="button"
                      aria-label={inPlaylist ? `把 ${video.name} 移出播放列表` : `把 ${video.name} 加入播放列表`}
                      aria-pressed={inPlaylist}
                      disabled={busy !== null}
                      onClick={() => void add('playlist', video.path)}
                    >
                      {inPlaylist ? '✓' : '≡'}
                    </button>
                    <button
                      type="button"
                      aria-label={favorite ? `取消收藏 ${video.name}` : `收藏 ${video.name}`}
                      aria-pressed={favorite}
                      disabled={busy !== null}
                      onClick={() => void add('favorite', video.path)}
                    >
                      {favorite ? '★' : '☆'}
                    </button>
                    <select
                      aria-label={`把 ${video.name} 加入命名收藏夹`}
                      value=""
                      disabled={busy !== null || customCollections.length === 0}
                      title={
                        customCollections.length === 0
                          ? '先在收藏夹页新建一个命名收藏夹'
                          : '加入命名收藏夹'
                      }
                      onChange={(event) => {
                        if (event.target.value !== '') {
                          void add(event.target.value, video.path)
                        }
                      }}
                    >
                      <option value="" disabled>
                        {customCollections.length === 0 ? '无收藏夹' : '收藏夹…'}
                      </option>
                      {customCollections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.paths.includes(video.path) ? `✓ ${collection.name}` : `＋ ${collection.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </div>
  )
}
