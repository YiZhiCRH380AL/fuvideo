import { useEffect, useMemo, useState } from 'react'

import type { Collections } from '../lib/backend'
import { fileName, parentDirectory } from '../lib/path'
import { cachedThumbnail, loadThumbnail } from '../lib/thumbnail-cache'
import './CollectionsPage.css'

export interface CollectionsPageProps {
  collections: Collections
  onClose: () => void
  onError: (cause: unknown) => void
  onPlay: (path: string) => void
  onReveal: (path: string) => void
  onCreate: (name: string) => Promise<Collections>
  onRename: (id: string, name: string) => Promise<Collections>
  onDelete: (id: string) => Promise<Collections>
  onToggleFavorite: (path: string) => Promise<void>
  onToggleNamedCollection: (id: string, path: string) => Promise<void>
}

type Selection = 'favorites' | string

/** 多个命名收藏夹的独立页面，快速收藏仍作为第一项保留。 */
export default function CollectionsPage({
  collections,
  onClose,
  onError,
  onPlay,
  onReveal,
  onCreate,
  onRename,
  onDelete,
  onToggleFavorite,
  onToggleNamedCollection,
}: CollectionsPageProps) {
  const [selected, setSelected] = useState<Selection>('favorites')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  const customCollections = collections.customCollections ?? []
  const custom = customCollections.find((item) => item.id === selected) ?? null
  const paths = custom?.paths ?? collections.favorites
  const title = custom?.name ?? '快速收藏'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      for (const path of paths) {
        if (cancelled) {
          return
        }

        const cached = cachedThumbnail(path)
        if (cached !== undefined) {
          setThumbs((previous) => ({ ...previous, [path]: cached }))
          continue
        }

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

  useEffect(() => {
    if (selected !== 'favorites' && custom === null) {
      setSelected('favorites')
    }
  }, [custom, selected])

  const counts = useMemo(
    () => ({
      favorites: collections.favorites.length,
      custom: customCollections.length,
    }),
    [collections.favorites.length, customCollections.length],
  )

  const run = async (action: () => Promise<Collections>) => {
    setBusy(true)
    try {
      return await action()
    } catch (cause: unknown) {
      onError(cause)
      return null
    } finally {
      setBusy(false)
    }
  }

  const submitCreate = async () => {
    const created = await run(() => onCreate(name))
    if (created === null) {
      return
    }

    const last = (created.customCollections ?? []).at(-1)
    if (last !== undefined) {
      setSelected(last.id)
    }
    setName('')
    setCreating(false)
  }

  const submitRename = async () => {
    if (custom === null) {
      return
    }

    if ((await run(() => onRename(custom.id, name))) !== null) {
      setName('')
      setRenaming(false)
    }
  }

  const removeCurrent = async (path: string) => {
    setBusy(true)
    try {
      if (custom === null) {
        await onToggleFavorite(path)
      } else {
        await onToggleNamedCollection(custom.id, path)
      }
    } catch (cause: unknown) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="collections-page" role="dialog" aria-modal="true" aria-label="收藏夹">
      <div className="collections-page__backdrop" onClick={onClose} />

      <div className="collections-page__panel">
        <header className="collections-page__head">
          <div>
            <span className="collections-page__kicker">SAVED ROOMS</span>
            <h2>收藏夹</h2>
          </div>
          <button type="button" className="collections-page__close" aria-label="关闭收藏夹" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="collections-page__body">
          <aside className="collections-page__rail" aria-label="收藏夹列表">
            <button
              type="button"
              className="collections-page__rail-item"
              aria-pressed={selected === 'favorites'}
              onClick={() => {
                setSelected('favorites')
                setConfirmDelete(false)
              }}
            >
              <span className="collections-page__rail-icon">★</span>
              <span>
                <strong>快速收藏</strong>
                <small>{counts.favorites} 个视频</small>
              </span>
            </button>

            {customCollections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className="collections-page__rail-item"
                aria-pressed={selected === collection.id}
                onClick={() => {
                  setSelected(collection.id)
                  setConfirmDelete(false)
                }}
              >
                <span className="collections-page__rail-icon">
                  {String(customCollections.indexOf(collection) + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.paths.length} 个视频</small>
                </span>
              </button>
            ))}

            {creating ? (
              <form
                className="collections-page__inline-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitCreate()
                }}
              >
                <input
                  autoFocus
                  maxLength={40}
                  value={name}
                  aria-label="新收藏夹名称"
                  placeholder="例如：周末电影"
                  onChange={(event) => setName(event.target.value)}
                />
                <button type="submit" disabled={busy || name.trim() === ''}>
                  建
                </button>
                <button type="button" onClick={() => setCreating(false)} aria-label="取消新建">
                  ×
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="collections-page__new"
                onClick={() => {
                  setName('')
                  setCreating(true)
                }}
              >
                <span aria-hidden="true">＋</span>
                新建收藏夹
              </button>
            )}

            <span className="collections-page__rail-foot">
              {counts.custom} 个命名收藏夹
            </span>
          </aside>

          <section className="collections-page__content" aria-label={title}>
            <div className="collections-page__toolbar">
              {renaming && custom !== null ? (
                <form
                  className="collections-page__rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitRename()
                  }}
                >
                  <input
                    autoFocus
                    maxLength={40}
                    value={name}
                    aria-label="收藏夹新名称"
                    onChange={(event) => setName(event.target.value)}
                  />
                  <button type="submit" disabled={busy || name.trim() === ''}>
                    保存
                  </button>
                  <button type="button" onClick={() => setRenaming(false)}>
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <div>
                    <span>{custom === null ? 'QUICK FAVORITES' : 'NAMED COLLECTION'}</span>
                    <h3>{title}</h3>
                  </div>
                  <span className="collections-page__count">{paths.length} 个视频</span>
                  {custom === null ? null : (
                    <div className="collections-page__tools">
                      <button
                        type="button"
                        onClick={() => {
                          setName(custom.name)
                          setRenaming(true)
                        }}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        data-confirming={confirmDelete ? 'true' : 'false'}
                        onClick={() => {
                          if (!confirmDelete) {
                            setConfirmDelete(true)
                            return
                          }

                          setBusy(true)
                          void onDelete(custom.id)
                            .then(() => {
                              setSelected('favorites')
                              setConfirmDelete(false)
                            })
                            .catch(onError)
                            .finally(() => setBusy(false))
                        }}
                        disabled={busy}
                      >
                        {confirmDelete ? '确认删除？' : '删除'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {paths.length === 0 ? (
              <div className="collections-page__empty">
                <span aria-hidden="true">☆</span>
                <strong>这里还没有视频</strong>
                <p>在播放页打开片库，从缩略图右侧把视频收进来。</p>
              </div>
            ) : (
              <ul className="collections-page__grid" data-testid={custom === null ? 'favorites-list' : 'named-collection-list'}>
                {paths.map((path) => (
                  <li className="collections-page__card" key={path}>
                    <button
                      type="button"
                      className="collections-page__thumb"
                      aria-label={`播放 ${fileName(path)}`}
                      onClick={() => onPlay(path)}
                    >
                      {thumbs[path] === undefined ? <span>FU</span> : <img src={thumbs[path]} alt="" />}
                      <span aria-hidden="true">▶</span>
                    </button>
                    <div className="collections-page__card-copy">
                      <strong title={path}>{fileName(path)}</strong>
                      <button
                        type="button"
                        aria-label={`跳到 ${parentDirectory(path)}`}
                        onClick={() => onReveal(path)}
                      >
                        {parentDirectory(path) || '所在目录未知'}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="collections-page__remove"
                      aria-label={`从${title}移出 ${fileName(path)}`}
                      onClick={() => void removeCurrent(path)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
