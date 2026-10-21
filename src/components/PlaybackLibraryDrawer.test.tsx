import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Collections, DirectoryListing } from '../lib/backend'
import PlaybackLibraryDrawer from './PlaybackLibraryDrawer'

vi.mock('../lib/thumbnail-cache', () => ({
  cachedThumbnail: () => undefined,
  loadThumbnail: async (path: string) => `data:image/jpeg;base64,${path}`,
}))

const CLIPS = String.raw`E:\clips`
const DEMO = String.raw`E:\clips\demo.mp4`

const listing: DirectoryListing = {
  directory: CLIPS,
  parent: 'E:\\',
  entries: [{ name: 'demo.mp4', path: DEMO, kind: 'video' }],
}

const collections: Collections = {
  playlist: [],
  favorites: [],
  customCollections: [{ id: 'night', name: '夜场', paths: [] }],
}

describe('播放页片库抽屉', () => {
  it('展示当前目录缩略图，并能加入播放列表、快速收藏和命名收藏夹', async () => {
    const user = userEvent.setup()
    const onTogglePlaylist = vi.fn(async () => {})
    const onToggleFavorite = vi.fn(async () => {})
    const onToggleNamedCollection = vi.fn(async () => {})

    render(
      <PlaybackLibraryDrawer
        open
        source={listing}
        collections={collections}
        onClose={() => {}}
        onError={() => {}}
        onChooseDirectory={async () => listing}
        onPlay={() => {}}
        onTogglePlaylist={onTogglePlaylist}
        onToggleFavorite={onToggleFavorite}
        onToggleNamedCollection={onToggleNamedCollection}
      />,
    )

    expect(screen.getByText('demo.mp4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '把 demo.mp4 加入播放列表' }))
    await user.click(screen.getByRole('button', { name: '收藏 demo.mp4' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '把 demo.mp4 加入命名收藏夹' }), 'night')

    await waitFor(() => expect(onTogglePlaylist).toHaveBeenCalledWith(DEMO))
    expect(onToggleFavorite).toHaveBeenCalledWith(DEMO)
    expect(onToggleNamedCollection).toHaveBeenCalledWith('night', DEMO)
  })

  it('可以在抽屉里选择另一个目录', async () => {
    const user = userEvent.setup()
    const other: DirectoryListing = {
      directory: String.raw`E:\other`,
      parent: 'E:\\',
      entries: [{ name: 'other.mp4', path: String.raw`E:\other\other.mp4`, kind: 'video' }],
    }

    render(
      <PlaybackLibraryDrawer
        open
        source={listing}
        collections={collections}
        onClose={() => {}}
        onError={() => {}}
        onChooseDirectory={async () => other}
        onPlay={() => {}}
        onTogglePlaylist={async () => {}}
        onToggleFavorite={async () => {}}
        onToggleNamedCollection={async () => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '选择目录' }))
    expect(await screen.findByText('other.mp4')).toBeInTheDocument()
  })
})
