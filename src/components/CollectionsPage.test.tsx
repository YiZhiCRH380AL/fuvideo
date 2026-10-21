import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Collections } from '../lib/backend'
import CollectionsPage from './CollectionsPage'

vi.mock('../lib/thumbnail-cache', () => ({
  cachedThumbnail: () => undefined,
  loadThumbnail: async (path: string) => `data:image/jpeg;base64,${path}`,
}))

const CLIPS = String.raw`E:\clips`
const DEMO = String.raw`E:\clips\demo.mp4`
const OTHER = String.raw`E:\clips\other.mp4`

function collections(): Collections {
  return {
    playlist: [],
    favorites: [DEMO],
    customCollections: [
      { id: 'night', name: '夜场', paths: [OTHER] },
      { id: 'weekend', name: '周末', paths: [] },
    ],
  }
}

describe('收藏夹页', () => {
  it('可以在快速收藏和多个命名收藏夹之间切换', async () => {
    const user = userEvent.setup()
    render(
      <CollectionsPage
        collections={collections()}
        onClose={() => {}}
        onError={() => {}}
        onPlay={() => {}}
        onReveal={() => {}}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleNamedCollection={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('favorites-list')).toHaveTextContent('demo.mp4')
    await user.click(screen.getByRole('button', { name: /夜场/ }))
    expect(await screen.findByTestId('named-collection-list')).toHaveTextContent('other.mp4')
    expect(screen.getByRole('heading', { name: '夜场' })).toBeInTheDocument()
  })

  it('新建收藏夹后自动切到新页', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async (_name: string) => {
      const next = collections()
      next.customCollections = [
        ...(next.customCollections ?? []),
        { id: 'new', name: '旅行', paths: [] },
      ]
      return next
    })

    function Harness() {
      const [data, setData] = useState(collections())

      return (
        <CollectionsPage
          collections={data}
          onClose={() => {}}
          onError={() => {}}
          onPlay={() => {}}
          onReveal={() => {}}
          onCreate={async (name) => {
            const next = await onCreate(name)
            setData(next)
            return next
          }}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onToggleFavorite={vi.fn()}
          onToggleNamedCollection={vi.fn()}
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '新建收藏夹' }))
    await user.type(screen.getByRole('textbox', { name: '新收藏夹名称' }), '旅行')
    await user.click(screen.getByRole('button', { name: '建' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('旅行'))
    expect(await screen.findByRole('heading', { name: '旅行' })).toBeInTheDocument()
  })

  it('重命名和删除只作用于当前命名收藏夹', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn(async () => ({
      ...collections(),
      customCollections: [
        { id: 'night', name: '深夜', paths: [OTHER] },
        { id: 'weekend', name: '周末', paths: [] },
      ],
    }))
    const onDelete = vi.fn(async () => ({
      ...collections(),
      customCollections: [{ id: 'weekend', name: '周末', paths: [] }],
    }))

    render(
      <CollectionsPage
        collections={collections()}
        onClose={() => {}}
        onError={() => {}}
        onPlay={() => {}}
        onReveal={() => {}}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onToggleFavorite={vi.fn()}
        onToggleNamedCollection={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /夜场/ }))
    await user.click(screen.getByRole('button', { name: '重命名' }))
    const input = screen.getByRole('textbox', { name: '收藏夹新名称' })
    await user.clear(input)
    await user.type(input, '深夜')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('night', '深夜'))

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '确认删除？' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('night'))
  })

  it('收藏页里的目录文字跳到原目录，播放按钮只负责播放', async () => {
    const user = userEvent.setup()
    const onPlay = vi.fn()
    const onReveal = vi.fn()

    render(
      <CollectionsPage
        collections={collections()}
        onClose={() => {}}
        onError={() => {}}
        onPlay={onPlay}
        onReveal={onReveal}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleNamedCollection={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '播放 demo.mp4' }))
    await user.click(screen.getByRole('button', { name: `跳到 ${CLIPS}` }))

    expect(onPlay).toHaveBeenCalledWith(DEMO)
    expect(onReveal).toHaveBeenCalledWith(DEMO)
  })
})
