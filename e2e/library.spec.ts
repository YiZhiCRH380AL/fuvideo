import { expect, test, type Page } from '@playwright/test'

/**
 * 在浏览器里搭一个假的 Tauri 后端。
 *
 * 目录浏览、此电脑这些界面只有桌面端才走得到（浏览器里按钮是灰的），
 * 而它们恰恰是布局最容易出问题的地方。这里把 `__TAURI_INTERNALS__.invoke`
 * 换成一张固定的答案表，就能在真浏览器里量它们的真实尺寸。
 */
async function installFakeTauri(
  page: Page,
  options: { tutorialSeen?: boolean; videoCount?: number } = {},
): Promise<void> {
  const tutorialSeen = options.tutorialSeen ?? true
  const videoCount = options.videoCount ?? 5

  await page.addInitScript(
    ({ tutorialSeen, videoCount }: { tutorialSeen: boolean; videoCount: number }) => {
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

    const videos = Array.from({ length: videoCount }, (_, index) => ({
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
    },
    { tutorialSeen, videoCount },
  )
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

  // 每一行要有封面，而且名字不省略号截断（长名字要能折行看全）
  const row = list.locator('.paths__item').first()
  await expect(row.locator('.paths__thumb img')).toBeVisible()
  await expect(row.locator('.paths__name')).toHaveCSS('white-space', 'normal')

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
test('视频多到要滚动时，每一格还是原来的高度', async ({ page }) => {
  await installFakeTauri(page, { videoCount: 40 })
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()
  await page.waitForTimeout(400)

  const sizes = await tileSizes(page)
  const grid = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="video-grid"]') as HTMLElement
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
  })

  expect(sizes).toHaveLength(40)
  // 网格确实滚起来了（内容比容器高），而且每一格都保持原尺寸
  expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight)
  expect(new Set(sizes.map((tile) => tile.height)).size).toBe(1)
  expect(sizes.every((tile) => tile.height > 150)).toBe(true)
})

test('从收藏夹跳回来之后，方格还是方格，并且那一格被高亮', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  const tile = page.locator('.tile').first()
  await tile.hover()
  await tile.getByRole('button', { name: /收藏/ }).first().click()

  await page.getByRole('button', { name: '收藏夹', exact: true }).click()
  const list = page.getByTestId('favorites-list')
  await expect(list).toBeVisible()

  const before = await tileSizes(page)

  await list.getByRole('button', { name: /^跳到 / }).click()
  await page.waitForTimeout(600)

  // 跳转前后每格的高度都不该变（曾经这里会塌成一条条长条）
  expect(await tileSizes(page)).toEqual(before)
  // 而且确实跳到了它所在的目录，把那一格标了出来
  await expect(page.locator('.tile[data-highlight="true"]')).toHaveCount(1)

  await page.screenshot({ path: 'test-results/shots/favorite-jump.png' })
})

/** 每个方格的高度、封面比例，以及它是不是「放大播放」的那一格。 */
async function tileSizes(
  page: Page,
): Promise<{ height: number; aspect: number; expanded: boolean }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="video-grid"] .tile')).map((tile) => {
      const frame = tile.querySelector('.tile__frame')?.getBoundingClientRect()

      return {
        height: Math.round(tile.getBoundingClientRect().height),
        // 封面区是不是还是 16:9——被压扁的时候它就守不住了
        aspect: frame === undefined || frame.height === 0 ? 0 : Number((frame.width / frame.height).toFixed(2)),
        expanded: tile.classList.contains('tile--expanded'),
      }
    }),
  )
}

test('放大播放时，下面那些方格不会被压扁', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()
  await page.waitForTimeout(400)

  const before = (await tileSizes(page)).map((tile) => tile.height)
  expect(before.every((height) => height > 150)).toBe(true)

  await page.locator('.tile').first().click()
  await page.waitForTimeout(500)

  const after = await tileSizes(page)
  const wall = after.filter((tile) => !tile.expanded)

  // 画面那一格占满整屏
  expect(after.filter((tile) => tile.expanded)).toHaveLength(1)

  /*
   * 下面那些方格要还是「方格」。
   *
   * 它们这时被挤到可视区外、由 overflow 裁掉，所以尺寸不必和展开前逐像素相等
   * （展开时网格去掉了间距，列宽本来就会变），但封面必须是 16:9 的正常形状——
   * 曾经它们在这儿被压成 2px 高的长条，从收藏夹跳回来滚一下就会露出来。
   */
  expect(wall.length).toBeGreaterThan(0)
  expect(wall.every((tile) => Math.abs(tile.aspect - 16 / 9) < 0.02)).toBe(true)
  expect(wall.every((tile) => tile.height > 100)).toBe(true)
})

