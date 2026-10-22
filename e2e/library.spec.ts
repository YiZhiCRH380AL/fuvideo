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
  options: {
    tutorialSeen?: boolean
    videoCount?: number
    playlist?: string[]
    lastDirectory?: string | null
  } = {},
): Promise<void> {
  const tutorialSeen = options.tutorialSeen ?? true
  const videoCount = options.videoCount ?? 5
  const seedPlaylist = options.playlist ?? []
  const lastDirectory = options.lastDirectory ?? null

  await page.addInitScript(
    ({
      tutorialSeen,
      videoCount,
      seedPlaylist,
      lastDirectory,
    }: {
      tutorialSeen: boolean
      videoCount: number
      seedPlaylist: string[]
      lastDirectory: string | null
    }) => {
    /**
     * 缩略图用一张 1920×1080 的占位图。
     *
     * 尺寸要像真的：之前用 1×1 的图，绕过了一个真实的坑——网格行高按内容算时，
     * 浏览器会拿图片的原生高度（1080）去撑行，整排方格会变成一屏高的柱子。
     */
    const pixel =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"></svg>')

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
    const collections = {
      playlist: [...seedPlaylist],
      favorites: [] as string[],
      customCollections: [
        {
          id: 'night',
          name: '夜场',
          paths: [] as string[],
        },
      ],
    }
    const copyCollections = () => ({
      playlist: [...collections.playlist],
      favorites: [...collections.favorites],
      customCollections: collections.customCollections.map((collection) => ({
        ...collection,
        paths: [...collection.paths],
      })),
    })

    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: async (cmd: string, args: Record<string, unknown>) => {
          switch (cmd) {
            case 'probe_mpv':
              return {
                available: true,
                version: '0.41.0',
                path: 'C:\\mpv\\mpv.exe',
                ytdlAvailable: true,
                ytdlPath: 'C:\\yt-dlp\\yt-dlp.exe',
              }
            case 'read_settings':
              return { lastDirectory }
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
            // 播放工具面板：章节表与 AB 点。面板那边对拿不到的情况有兜底
            case 'chapters':
              return [
                { index: 0, title: '开场', time: 0 },
                { index: 1, title: '正片', time: 65 },
              ]
            case 'ab_loop':
              return { a: null, b: null }
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
            case 'create_collection': {
              const collection = {
                id: `custom-${collections.customCollections.length + 1}`,
                name: args.name as string,
                paths: [] as string[],
              }
              collections.customCollections = [...collections.customCollections, collection]
              return copyCollections()
            }
            case 'rename_collection': {
              collections.customCollections = collections.customCollections.map((collection) =>
                collection.id === args.id ? { ...collection, name: args.name as string } : collection,
              )
              return copyCollections()
            }
            case 'delete_collection': {
              collections.customCollections = collections.customCollections.filter(
                (collection) => collection.id !== args.id,
              )
              return copyCollections()
            }
            case 'toggle_named_collection': {
              collections.customCollections = collections.customCollections.map((collection) => {
                if (collection.id !== args.id) {
                  return collection
                }

                const path = args.path as string
                return {
                  ...collection,
                  paths: collection.paths.includes(path)
                    ? collection.paths.filter((item) => item !== path)
                    : [...collection.paths, path],
                }
              })
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
    { tutorialSeen, videoCount, seedPlaylist, lastDirectory },
  )
}

async function waitForBoot(page: Page): Promise<void> {
  await expect(page.locator('.app')).toHaveAttribute('data-splash', 'done', { timeout: 8000 })
  await expect(page.getByTestId('splash')).toHaveCount(0)
}

/** 左侧导航默认只留一条窄轨，鼠标靠近后才展开。 */
async function expandAppSidebar(page: Page): Promise<void> {
  const viewport = page.viewportSize()

  if (viewport !== null) {
    await page.mouse.move(5, Math.round(viewport.height / 2))
  }

  await expect(page.locator('.app-sidebar__content')).toHaveCSS('opacity', '1')
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

test('文件夹侧栏卡片尺寸一致，目录多了只在栏内滚动', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('folder-strip')).toBeVisible()
  await expandAppSidebar(page)
  // 卡片是错峰淡入的，等动画走完再量、再截图，否则拍到的是半透明的一帧
  await page.waitForTimeout(700)

  const folders = await measureCards(page, '[data-testid="folder-strip"]')

  // 断言之前先截图：失败的时候也能看一眼到底长什么样
  await page.screenshot({ path: 'test-results/shots/library.png' })

  expect(folders).not.toBeNull()
  // 8 个卡片：7 个子目录 + 一个「上一级」
  expect(folders!.total).toBe(8)
  expect(folders!.cards.every((card) => card.height >= 54)).toBe(true)
  expect(folders!.cards.every((card) => card.cover === 40)).toBe(true)
  // 目录多了在侧栏内部纵向滚动，最后一项滚到底后必须完整可见。
  expect(folders!.scrollHeight).toBeGreaterThan(folders!.clientHeight + 1)
  await page.getByTestId('folder-strip').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await page.waitForTimeout(120)
  const scrolled = await measureCards(page, '[data-testid="folder-strip"]')
  expect(scrolled!.cards.at(-1)?.clipped).toBe(false)
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
  expect(drives!.cards.every((card) => card.cover === 100)).toBe(true)

})

test('左侧轨道鼠标靠近时展开文件夹，移开后收起', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  // 顶部栏只保留品牌和路径，操作按钮已经全部收进左侧轨道。
  await expect(page.locator('.app__bar .app__tool')).toHaveCount(0)
  await expect(page.locator('.app-sidebar__actions .app__tool').first()).toBeAttached()

  const rail = await page.getByRole('complementary', { name: '文件夹导航' }).boundingBox()
  expect(rail).not.toBeNull()
  expect(rail!.width).toBeLessThan(30)

  await expandAppSidebar(page)
  const search = await page.getByRole('searchbox', { name: '搜索这个目录' }).boundingBox()
  const folders = await page.getByTestId('folder-strip').boundingBox()
  const grid = await page.getByTestId('video-grid').boundingBox()
  const content = await page.locator('.app-sidebar__content').boundingBox()

  expect(search).not.toBeNull()
  expect(folders).not.toBeNull()
  expect(grid).not.toBeNull()
  expect(content).not.toBeNull()
  expect(content!.width).toBeGreaterThan(200)
  expect(content!.x).toBeLessThan(2)
  expect(folders!.x).toBeGreaterThanOrEqual(content!.x)
  expect(folders!.x + folders!.width).toBeLessThanOrEqual(content!.x + content!.width)
  expect(search!.y).toBeLessThan(grid!.y)

  await page.mouse.move(900, 360)
  await expect(page.locator('.app-sidebar__content')).toHaveCSS('opacity', '0')
})

test('记住上次目录时也先显示首页封面，品牌字标可以随时返回', async ({ page }) => {
  await installFakeTauri(page, { lastDirectory: 'E:\\clips' })
  await page.goto('/')
  await waitForBoot(page)

  await expect(page.getByRole('heading', { name: /让每一帧.*都有你的颜色/ })).toBeVisible()
  await expect(page.getByTestId('video-grid')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '继续上次片库' })).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/home-page.png', fullPage: true })

  await page.getByRole('button', { name: '继续上次片库' }).click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  await page.getByTestId('home-button').click()
  await expect(page.getByRole('heading', { name: /让每一帧.*都有你的颜色/ })).toBeVisible()
  await expect(page.getByTestId('video-grid')).toHaveCount(0)
})

test('播放页片库抽屉可从缩略图加入播放列表和多个收藏夹', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()
  await page.getByRole('button', { name: 'demo-1.mp4', exact: true }).click()
  await expect(page.getByTestId('expanded-tile')).toBeVisible()

  // 进入播放页之后，底层方格必须全部隐藏。
  await expect(page.locator('.tile:not(.tile--expanded)').first()).toHaveCSS('display', 'none')

  const libraryTab = page.getByRole('button', { name: '打开播放片库' })
  await expect(libraryTab).toHaveCSS('width', '31px')
  await libraryTab.hover()
  await expect(libraryTab).toHaveCSS('width', '64px')
  await libraryTab.click()
  const drawer = page.getByRole('dialog', { name: '播放片库' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('demo-1.mp4')).toBeVisible()

  await drawer.getByRole('button', { name: '把 demo-1.mp4 加入播放列表' }).click()
  await drawer.getByRole('button', { name: '收藏 demo-1.mp4' }).click()
  await drawer
    .getByRole('combobox', { name: '把 demo-1.mp4 加入命名收藏夹' })
    .selectOption('night')
  await page.screenshot({ path: 'test-results/shots/playback-library-drawer.png' })

  await page.getByRole('button', { name: '关闭片库面板' }).click()
  await expandAppSidebar(page)
  await page.getByRole('button', { name: '收藏夹', exact: true }).click()
  const pageDialog = page.getByRole('dialog', { name: '收藏夹' })
  await expect(pageDialog.getByTestId('favorites-list')).toContainText('demo-1.mp4')
  await pageDialog.getByRole('button', { name: /夜场/ }).click()
  await expect(pageDialog.getByTestId('named-collection-list')).toContainText('demo-1.mp4')
})

test('收藏夹页可以新建、重命名和删除多个命名收藏夹', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await expandAppSidebar(page)
  await page.getByRole('button', { name: '收藏夹', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '收藏夹' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: '新建收藏夹' }).click()
  await dialog.getByRole('textbox', { name: '新收藏夹名称' }).fill('旅行')
  await dialog.getByRole('button', { name: '建', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '旅行' })).toBeVisible()

  await dialog.getByRole('button', { name: '新建收藏夹' }).click()
  await dialog.getByRole('textbox', { name: '新收藏夹名称' }).fill('纪录片')
  await dialog.getByRole('button', { name: '建', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /纪录片/ })).toBeVisible()

  await dialog.getByRole('button', { name: '重命名' }).click()
  const rename = dialog.getByRole('textbox', { name: '收藏夹新名称' })
  await rename.fill('纪录片笔记')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog.getByRole('heading', { name: '纪录片笔记' })).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/collections-page.png' })

  await dialog.getByRole('button', { name: '删除' }).click()
  await dialog.getByRole('button', { name: '确认删除？' }).click()
  await expect(dialog.getByRole('button', { name: /纪录片笔记/ })).toHaveCount(0)
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
  await expandAppSidebar(page)
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

test('空状态下从播放列表点名字：引导语让位给方格墙，然后开始播放', async ({ page }) => {
  // 预置一条播放列表，这样「还没选过目录」和「列表里有东西」能同时成立
  await installFakeTauri(page, { playlist: ['E:\\clips\\demo-1.mp4'] })
  await page.goto('/')
  await waitForBoot(page)

  const hint = page.getByText('选一个目录，把里面的视频铺成方格')
  await expect(hint).toBeVisible()

  await expandAppSidebar(page)
  await page.getByRole('button', { name: '播放列表', exact: true }).click()
  const list = page.getByTestId('playlist-list')
  await expect(list).toBeVisible()

  // 精确匹配：那几颗工具按钮的名字里也带文件名
  await list.getByRole('button', { name: 'demo-1.mp4', exact: true }).click()

  // 先切到它所在的目录：引导语消失、方格墙出现（这是这次修的 bug）
  await expect(hint).toHaveCount(0)
  await expect(page.getByTestId('video-grid')).toBeVisible()
  // 再开始播放
  await expect(page.getByTestId('island')).toBeVisible()
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
  // 卡片高度要和封面 + 名字对得上，不能被图片原生高度撑成柱子
  expect(sizes.every((tile) => tile.slack < 80), JSON.stringify(sizes)).toBe(true)
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

  await expandAppSidebar(page)
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
        // 卡片比封面高出来的部分（名字那一行）。撑成柱子时这里会是几百上千
        slack: frame === undefined ? 0 : Math.round(tile.getBoundingClientRect().height - frame.height),
        // 封面区是不是还是 16:9——被压扁的时候它就守不住了
        aspect: frame === undefined || frame.height === 0 ? 0 : Number((frame.width / frame.height).toFixed(2)),
        expanded: tile.classList.contains('tile--expanded'),
      }
    }),
  )
}

test('进入播放页后底层方格全部隐藏，只留播放画面', async ({ page }) => {
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
  // 画面那一格占满整屏
  expect(after.filter((tile) => tile.expanded)).toHaveLength(1)
  await expect(page.locator('.tile:not(.tile--expanded)').first()).toHaveCSS('display', 'none')
  await expect(page.locator('.tile--expanded')).toHaveCount(1)
})

test('日光主题播放页不会再用卡片底色遮住视频', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await expandAppSidebar(page)
  await page.getByRole('button', { name: /更换颜色主题/ }).click()
  await page.getByRole('radio', { name: /日光纸/ }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await page.getByRole('button', { name: 'demo-1.mp4', exact: true }).click()
  await expect(page.getByTestId('expanded-tile')).toBeVisible()
  // 卡片原有 240ms 阴影过渡会在这之后归零，不能把过渡中的一帧误判成残留图层。
  await page.waitForTimeout(400)

  const style = await page.getByTestId('expanded-tile').evaluate((element) => {
    const computed = getComputedStyle(element)

    return {
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      borderTopWidth: computed.borderTopWidth,
      boxShadow: computed.boxShadow,
    }
  })

  expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(style.backgroundImage).toBe('none')
  expect(style.borderTopWidth).toBe('0px')
  expect(style.boxShadow, JSON.stringify(style)).toBe('none')
  await page.screenshot({ path: 'test-results/shots/playback-daylight.png' })
})

/**
 * 播放工具面板：章节、AB 循环、定时、窗口、打开地址五块都要在，
 * 而且面板本身不能撑出窗口——它是顶栏底下的一层浮层，撑出去就点不到了。
 */
test('播放工具面板：五块内容都在，且不撑出窗口', async ({ page }) => {
  await installFakeTauri(page)
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  // 有片子才有章节表去问后端
  // 名字要精确匹配：方格上那两颗动作按钮的可访问名字里也带着文件名
  await page.getByRole('button', { name: 'demo-1.mp4', exact: true }).click()
  await expect(page.getByTestId('expanded-tile')).toBeVisible()

  await expandAppSidebar(page)
  await page.getByRole('button', { name: '播放工具' }).click()
  const panel = page.getByTestId('playback-tools')
  await expect(panel).toBeVisible()

  // 转场幕布 520ms 后自己撤掉；不撤的话整屏看着都是暗的
  await expect(page.getByTestId('curtain')).toHaveCount(0, { timeout: 2000 })

  // 章节来自假后端，两段都列出来
  await expect(panel.getByRole('button', { name: /开场/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /正片/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /设 A/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: '15 分' })).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: /迷你模式/ })).toBeVisible()
  await expect(panel.getByRole('textbox', { name: '视频地址' })).toBeVisible()

  const box = await panel.boundingBox()
  const viewport = page.viewportSize()

  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  // 浮层要整块留在窗口里：左边不能是负数，右边不能越界
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)

  // 等动画都停下来再截图，否则拍到的是半透明的一帧
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/shots/playback-tools.png' })
})

/** 方格墙的搜索与排序：只改怎么摆，不动目录本身。 */
test('方格墙可以按名字搜、按名字排', async ({ page }) => {
  await installFakeTauri(page, { videoCount: 3 })
  await page.goto('/')
  await waitForBoot(page)

  await page.getByRole('button', { name: '选择目录' }).first().click()
  await expect(page.getByTestId('video-grid')).toBeVisible()

  const search = page.getByRole('searchbox', { name: '搜索这个目录' })
  await search.fill('demo-2')

  await expect(page.getByRole('button', { name: 'demo-2.mp4', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'demo-1.mp4', exact: true })).toHaveCount(0)

  // 搜不到东西时给的是「没有匹配」，不是「这个目录里没有视频」
  await search.fill('zzz')
  await expect(page.getByText(/没有名字里有「zzz」的条目/)).toBeVisible()

  await search.fill('')
  await page.getByRole('button', { name: '名称 ↓' }).click()

  const order = await page
    .getByTestId('video-grid')
    .locator('.tile__name')
    .allTextContents()

  expect(order[0]).toBe('demo-3.mp4')
  expect(order[order.length - 1]).toBe('demo-1.mp4')
})

/**
 * 窄窗口体检。
 *
 * 迷你模式把窗口缩到 560×315，而 640×400 是主窗口的尺寸下限。这两个尺寸下的布局
 * 一直没人量过（也不该自己开窗口去试），这里把浏览器视口调成同样的尺寸，
 * 量「有没有出界 / 被裁」——不是看截图顺不顺眼。
 */
for (const viewport of [
  { width: 560, height: 315 },
  { width: 640, height: 400 },
]) {
  test(`窄窗口 ${viewport.width}×${viewport.height}：灵动岛与 ⋮ 面板都不出界`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await installFakeTauri(page)
    await page.goto('/')
    await waitForBoot(page)

    await page.getByRole('button', { name: '选择目录' }).first().click()
    await expect(page.getByTestId('video-grid')).toBeVisible()

    await page.getByRole('button', { name: 'demo-1.mp4', exact: true }).click()
    await expect(page.getByTestId('expanded-tile')).toBeVisible()
    // 转场幕布 520ms 后撤掉，等它走完再量
    await expect(page.getByTestId('curtain')).toHaveCount(0, { timeout: 2000 })

    const island = page.locator('.island')
    const islandBox = await island.boundingBox()

    expect(islandBox).not.toBeNull()
    // 整块留在视口里：左、右、下三条边都不能越界
    expect(islandBox!.x).toBeGreaterThanOrEqual(-0.5)
    expect(islandBox!.x + islandBox!.width).toBeLessThanOrEqual(viewport.width + 0.5)
    expect(islandBox!.y + islandBox!.height).toBeLessThanOrEqual(viewport.height + 0.5)

    // 里面那一排控件不能横向撑出去（撑出去的部分会被裁掉，用户就点不到了）
    const islandOverflow = await island.evaluate((node) => node.scrollWidth - node.clientWidth)

    expect(islandOverflow).toBeLessThanOrEqual(1)

    await expandAppSidebar(page)
    await page.getByRole('button', { name: '播放工具' }).click()

    const panel = page.locator('.app__tools-menu .popover')
    // 菜单有 190ms 的位移缩放动画；等停稳再量，否则量到的是入场中的一帧。
    await page.waitForTimeout(240)
    const panelBox = await panel.boundingBox()
    const panelStyle = await panel.evaluate((node) => {
      const style = getComputedStyle(node)

      return {
        position: style.position,
        top: style.top,
        transform: style.transform,
        opacity: style.opacity,
        maxHeight: style.maxHeight,
        height: style.height,
        parentTransform: getComputedStyle(node.parentElement?.parentElement ?? node).transform,
      }
    })

    expect(panelBox).not.toBeNull()
    expect(panelBox!.x).toBeGreaterThanOrEqual(-0.5)
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width + 0.5)
    expect(panelBox!.y + panelBox!.height, JSON.stringify(panelStyle)).toBeLessThanOrEqual(
      viewport.height + 0.5,
    )

    // 放不下的时候得能滚，而不是把底下的内容裁掉
    const panelScroll = await panel.evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }))

    expect(panelScroll.scrollHeight).toBeGreaterThan(0)
    expect(panelScroll.clientHeight).toBeGreaterThan(0)

    await page.waitForTimeout(600)
    await page.screenshot({ path: `test-results/shots/narrow-${viewport.width}.png` })
  })
}

