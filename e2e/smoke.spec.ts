import { expect, test, type Page } from '@playwright/test'

/** 先记下教程看过，免得首次进入的浮层挡住要测的东西。 */
async function markTutorialSeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('fuvideo:tutorial-seen', '1')
    } catch {
      // about:blank 这类上下文里拿不到存储，忽略
    }
  })
}

// 除了专门测首次教程的那条，其余用例都先把教程标记成看过
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('首次进入的教程')) {
    return
  }

  await markTutorialSeen(page)
})

/** 等开屏退场：浮层没走之前底下的界面是隐着的，也点不动。 */
async function waitForBoot(page: Page): Promise<void> {
  await expect(page.locator('.app')).toHaveAttribute('data-splash', 'done', { timeout: 8000 })
  await expect(page.getByTestId('splash')).toHaveCount(0)
}

// 注意：名字里必须留着「首次进入的教程」，上面的 beforeEach 靠它决定要不要先标记成看过
test('首次进入的教程是交互式的，走过一次不再弹', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  const tutorial = page.getByTestId('tutorial')
  await expect(tutorial).toBeVisible()

  // 前两步是真的要动手：第一步高亮「选择目录」并等用户去点。
  // 浏览器里选不了目录，所以走「跳过这步」。
  await expect(tutorial).toContainText('先挑一个放视频的文件夹')
  await expect(page.getByTestId('tutorial-spotlight')).toBeVisible()
  await page.getByRole('button', { name: '跳过这步' }).click()

  await expect(tutorial).toContainText('点一格，放大播放')
  await page.getByRole('button', { name: '跳过这步' }).click()

  await expect(tutorial).toContainText('底部的灵动岛')
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(tutorial).toContainText('音轨、字幕在这里换')
  await expect(tutorial).toContainText('加载字幕文件')
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(tutorial).toContainText('右上角是设置')
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(tutorial).toContainText('键盘也能用')

  await page.getByRole('button', { name: '开始使用' }).click()
  await expect(tutorial).toHaveCount(0)

  // 刷新一次：看过了就不该再弹
  await page.reload()
  await waitForBoot(page)
  await expect(page.getByTestId('tutorial')).toHaveCount(0)
})

test('启动先放开屏动画，环境探完后退场', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('splash')).toBeVisible()
  await expect(page.getByTestId('splash').locator('.splash__logo')).toBeVisible()

  await waitForBoot(page)
})

test('播放器外壳能加载并显示运行环境', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  await expect(page.locator('.app__wordmark')).toHaveText('futurevideo')
  await expect(page.getByTestId('backend-status')).toContainText('浏览器')
  await expect(page.getByText('选一个目录，把里面的视频铺成方格')).toBeVisible()
})

test('浏览器环境下选择目录不可用，避免误导用户', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  await expect(page.getByRole('button', { name: '选择目录' })).toBeDisabled()
})

test('未播放视频时窗口有不透明底色，不会透出桌面', async ({ page }) => {
  await page.goto('/')

  const appBackground = await page
    .locator('.app')
    .evaluate((element) => getComputedStyle(element).backgroundColor)

  expect(appBackground).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
})

test('目录区占满整窗，不再有侧边栏', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  // 侧边栏整块去掉了：目录导航进标题栏，子目录进中心区域
  await expect(page.locator('.sidebar')).toHaveCount(0)

  const size = page.viewportSize()
  const library = await page.locator('.library').boundingBox()
  const choose = await page.getByRole('button', { name: '选择目录' }).boundingBox()

  expect(size).not.toBeNull()
  expect(library).not.toBeNull()
  expect(choose).not.toBeNull()
  // 目录区从窗口最左边铺到最右边，没有侧边栏占位
  expect(library!.x).toBeLessThan(1)
  expect(library!.width).toBeGreaterThan(size!.width - 1)
  // 引导按钮落在窗口正中间，说明目录区确实占了整块主区域
  expect(Math.abs(choose!.x + choose!.width / 2 - size!.width / 2)).toBeLessThan(6)
})

test('放大格铺满可视区，而不是塌成 0 高', async ({ page }) => {
  await page.goto('/')

  // 浏览器里没有视频可以播，直接构造展开态量高度——
  // 这正是「只听到声音看不到画面」的那个坑：放大格塌掉后，
  // 后面的方格会顶上来把画面盖住
  const measured = await page.evaluate(() => {
    const library = document.querySelector('.library')

    if (library === null) {
      return null
    }

    const grid = document.createElement('div')
    grid.className = 'grid'
    grid.dataset.expanded = 'true'

    const expanded = document.createElement('div')
    expanded.className = 'tile tile--expanded'

    const other = document.createElement('div')
    other.className = 'tile'

    grid.append(expanded, other)
    library.append(grid)

    const result = {
      library: library.getBoundingClientRect().height,
      expanded: expanded.getBoundingClientRect().height,
      otherTop: other.getBoundingClientRect().top,
      expandedBottom: expanded.getBoundingClientRect().bottom,
    }

    grid.remove()

    return result
  })

  expect(measured).not.toBeNull()
  expect(measured!.library).toBeGreaterThan(200)
  expect(measured!.expanded).toBeGreaterThan(measured!.library * 0.9)
  // 其他方格必须排到画面下面去
  expect(measured!.otherTop).toBeGreaterThanOrEqual(measured!.expandedBottom - 1)
})
