import { expect, test, type Page } from '@playwright/test'

/**
 * 在浏览器里搭一个假的 Tauri 后端。
 *
 * 目录浏览、此电脑这些界面只有桌面端才走得到（浏览器里按钮是灰的），
 * 而它们恰恰是布局最容易出问题的地方。这里把 `__TAURI_INTERNALS__.invoke`
 * 换成一张固定的答案表，就能在真浏览器里量它们的真实尺寸。
 */
async function installFakeTauri(page: Page, options: { tutorialSeen?: boolean } = {}): Promise<void> {
  await page.addInitScript((tutorialSeen: boolean) => {
    /** 1×1 的透明 GIF，当缩略图用。 */
    const pixel =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

    const clips = 'E:\\clips'

    /** 故意多塞几个文件夹：文件夹条要在目录多的时候也不撑破布局。 */
    const folders = Array.from({ length: 7 }, (_, index) => ({
      name: `anime-${index + 1}`,
      path: `E:\\clips\\anime-${index + 1}`,
      kind: 'directory',
    }))

    const videos = Array.from({ length: 5 }, (_, index) => ({
      name: `demo-${index + 1}.mp4`,
      path: `E:\\clips\\demo-${index + 1}.mp4`,
      kind: 'video',
    }))

    const listing = { directory: clips, parent: 'E:\\', entries: [...folders, ...videos] }

    // 除教程那条用例以外，其余用例都不关心这个浮层
    if (tutorialSeen) {
      try {
        window.localStorage.setItem('fuvideo:tutorial-seen', '1')
      } catch {
        // about:blank 之类的上下文拿不到存储，忽略
      }
    }

    /** 自带的示例文件夹：示例目录打开的是一个真实目录，这里也给它一份内容。 */
    const sample = 'C:\\Users\\tester\\AppData\\Roaming\\com.fuvideo.desktop\\示例视频'

    /** 播放列表与收藏夹：假后端也要真的增删改，界面才看得到结果。 */
    const collections = { playlist: [] as string[], favorites: [] as string[] }
    const copyCollections = () => ({
      playlist: [...collections.playlist],
      favorites: [...collections.favorites],
    })

    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: async (cmd: string, args: Record<string, unknown>) => {
          switch (cmd) {
            case 'probe_mpv':
              return { available: true, version: '0.41.0', path: 'C:\\mpv\\mpv.exe' }
            case 'pick_directory':
              return clips
            case 'prepare_sample_folder':
              return sample
            case 'list_drives':
              return ['C:\\', 'D:\\', 'E:\\']
            case 'list_directory':
              return args.directory === clips || args.directory === sample
                ? listing
                : { directory: args.directory, parent: null, entries: [] }
            case 'thumbnail_at':
              return pixel
            case 'read_collections':
              return copyCollections()
            case 'toggle_playlist': {
              const path = args.path as string
              collections.playlist = collections.playlist.includes(path)
                ? collections.playlist.filter((item) => item !== path)
                : [...collections.playlist, path]
              return copyCollections()
            }
            case 'toggle_favorite': {
              const path = args.path as string
              collections.favorites = collections.favorites.includes(path)
                ? collections.favorites.filter((item) => item !== path)
                : [...collections.favorites, path]
              return copyCollections()
            }
            default:
              return null
          }
        },
        transformCallback: (callback: unknown) => callback,
        unregisterCallback: () => {},
        convertFileSrc: (path: string) => path,
      },
    })
  }, options.tutorialSeen ?? true)
}

async function waitForBoot(page: Page): Promise<void> {
  await expect(page.locator('.app')).toHaveAttribute('data-splash', 'done', { timeout: 8000 })
  await expect(page.getByTestId('splash')).toHaveCount(0)
}

/** 量一个滚动容器里的卡片：高度、有没有被容器裁掉。 */
async function measureCards(page: Page, selector: string) {
  return page.evaluate((target) => {
    const container = document.querySelector(target) as HTMLElement | null

    if (container === null) {
      return null
    }

    const bounds = container.getBoundingClientRect()
    const cards = Array.from(container.querySelectorAll('.folder, .tile')) as HTMLElement[]

    return {
      container: {
        top: Math.round(bounds.top * 10) / 10,
        bottom: Math.round(bounds.bottom * 10) / 10,
        height: Math.round(bounds.height * 10) / 10,
        width: Math.round(bounds.width * 10) / 10,
      },
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      total: cards.length,
      cards: cards.map((card) => {
        const box = card.getBoundingClientRect()
        const frame = card.querySelector('.folder__frame') as HTMLElement | null

        return {
          top: Math.round(box.top * 10) / 10,
          bottom: Math.round(box.bottom * 10) / 10,
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
          cover: frame === null ? null : Math.round(frame.getBoundingClientRect().height * 10) / 10,
          clipped: box.bottom > bounds.bottom + 0.5,
        }
      }),
    }
  }, selector)
}

test('文件夹条里的卡片一张都不能被裁', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('folder-strip')).toBeVisible()
  // 卡片是错峰淡入的，等动画走完再量、再截图，否则拍到的是半透明的一帧
  await page.waitForTimeout(700)

  const folders = await measureCards(page, '[data-testid="folder-strip"]')

  // 断言之前先截图：失败的时候也能看一眼到底长什么样
  await page.screenshot({ path: 'test-results/shots/library.png' })

  expect(folders).not.toBeNull()
  // 8 个卡片：7 个子目录 + 一个「上一级」
  expect(folders!.total).toBe(8)
  expect(folders!.cards.filter((card) => card.clipped)).toEqual([])
  expect(folders!.cards.every((card) => card.height > 100)).toBe(true)
  expect(folders!.cards.every((card) => card.cover === 92)).toBe(true)
  // 单行横向排：竖向不该有内容溢出，不然就是又被压扁了
  expect(folders!.scrollHeight).toBeLessThanOrEqual(folders!.clientHeight + 1)
  // 底边要留得下入场那 6px 的上浮，否则动画期间卡片会被裁一刀
  const slack = folders!.container.bottom - Math.max(...folders!.cards.map((card) => card.bottom))
  expect(slack).toBeGreaterThanOrEqual(6)
})

test('此电脑里的磁盘卡片高度一致、不被裁', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '浏览磁盘' }).click()
  await expect(page.getByTestId('drives')).toBeVisible()
  await page.waitForTimeout(700)

  const drives = await measureCards(page, '[data-testid="drives"]')

  await page.screenshot({ path: 'test-results/shots/drives.png' })
  expect(drives).not.toBeNull()
  expect(drives!.total).toBe(3)
  expect(drives!.cards.filter((card) => card.clipped)).toEqual([])
  // 同一行里高度必须一样，不然一眼就看得出「高度不完全」
  expect(new Set(drives!.cards.map((card) => card.height)).size).toBe(1)
  expect(drives!.cards.every((card) => card.cover === 92)).toBe(true)

})

test('鼠标移到方格上才浮出「加列表 / 收藏」两颗按钮', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  const tile = page.locator('.tile').first()
  const actions = tile.locator('.tile__actions')

  // 没碰它的时候是透明的：这就是「鼠标触碰才出现」
  await expect(actions).toHaveCSS('opacity', '0')

  await tile.hover()
  await expect(actions).toHaveCSS('opacity', '1')

  // 加进播放列表，再从右上角打开面板看它
  await tile.getByRole('button', { name: /加入播放列表/ }).click()
  // 名字要精确匹配：方格上那几颗「加入播放列表」也含这几个字
  await page.getByRole('button', { name: '播放列表', exact: true }).click()

  const list = page.getByTestId('playlist-list')
  await expect(list).toBeVisible()
  await expect(list).toContainText('demo-1.mp4')

  // 面板是淡入的，等动画走完再截图，否则拍到的是一张近乎透明的图
  await expect(page.getByTestId('popover')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/shots/playlist.png' })
})

test('教程能带着用户真的走一遍：看示例 → 点方格播放', async ({ page }) => {
  await installFakeTauri(page, { tutorialSeen: false })
  await page.goto('/')
  await waitForBoot(page)

  const tutorial = page.getByTestId('tutorial')

  // 第一步：高亮「看示例视频」，等用户真的去点
  await expect(tutorial).toContainText('先看一段自带的示例')
  await expect(page.getByTestId('tutorial-spotlight')).toBeVisible()
  await expect(page.getByRole('button', { name: '等你操作' })).toBeDisabled()

  await page.getByRole('button', { name: '看示例视频' }).click()

  // 示例目录打开之后自己翻页，方格墙也出来了
  await expect(tutorial).toContainText('点一格，放大播放')
  await expect(page.getByTestId('video-grid')).toBeVisible()

  // 第二步：真的点一格，播放起来之后自动进第三步
  await page.locator('.tile').first().click()

  await expect(tutorial).toContainText('底部的灵动岛')
  await expect(page.getByTestId('island')).toBeVisible()
  // 打光框跟到灵动岛上，而不是留在上一屏的位置
  await expect(page.getByTestId('tutorial-spotlight')).toBeVisible()
})
