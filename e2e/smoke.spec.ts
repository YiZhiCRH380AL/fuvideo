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

  // 前两步是真的要动手：第一步高亮「看示例视频」并等用户去点。
  // 浏览器里没有后端，点了也没用，所以走「跳过这步」。
  await expect(tutorial).toContainText('先看一段自带的示例')
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

  // 回归：这一步以前框住的是播放列表按钮（目标用了共用的 .app__tool）
  await page.waitForTimeout(400)
  const spotlight = await page.getByTestId('tutorial-spotlight').boundingBox()
  const gear = await page.getByRole('button', { name: '设置', exact: true }).boundingBox()
  const playlist = await page.getByRole('button', { name: '播放列表', exact: true }).boundingBox()

  expect(spotlight).not.toBeNull()
  expect(gear).not.toBeNull()
  expect(playlist).not.toBeNull()
  // 框住的是齿轮：整个按钮都在打光框里面
  expect(spotlight!.x).toBeLessThanOrEqual(gear!.x)
  expect(spotlight!.x + spotlight!.width).toBeGreaterThanOrEqual(gear!.x + gear!.width)
  // 而且没框到左边那颗播放列表
  expect(spotlight!.x).toBeGreaterThan(playlist!.x + playlist!.width)

  await page.screenshot({ path: 'test-results/shots/tutorial-settings.png' })

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

  await expect(page.locator('.app__wordmark')).toContainText('FutureVideo')
  // 版本号在字标右下角，跟着 package.json 走
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+/)
  await expect(page.getByTestId('backend-status')).toContainText('浏览器')
  await expect(page.getByText('选一个目录，把里面的视频铺成方格')).toBeVisible()
})

test('颜色主题可以从顶栏即时切换并保存在本地', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await page.getByRole('button', { name: /更换颜色主题/ }).click()
  await expect(page.getByRole('dialog', { name: '颜色主题' })).toBeVisible()

  await page.getByRole('radio', { name: /余烬橙/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember')
  await expect(page.getByRole('button', { name: /更换颜色主题/ })).toHaveAccessibleName(
    /余烬橙/,
  )
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('fuvideo.theme')))
    .toBe('ember')

  await page.waitForTimeout(700)
  await page.screenshot({ path: 'test-results/shots/theme-ember.png', fullPage: true })

  // 刷新后先从本地提示值铺色，不能在等待设置接口时闪回极夜蓝。
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember')
  await waitForBoot(page)
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

test('目录区占满整窗，首屏引导使用新的左右分栏', async ({ page }) => {
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
  const hero = await page.locator('.library__hero').boundingBox()
  const poster = await page.locator('.library__poster--front').boundingBox()

  expect(hero).not.toBeNull()
  expect(poster).not.toBeNull()
  // 主行动按钮在左栏，海报舞台在右栏；两者都留在视口内
  expect(choose!.x).toBeLessThan(size!.width / 2)
  expect(poster!.x).toBeGreaterThan(size!.width / 2)
  expect(hero!.width).toBeLessThanOrEqual(size!.width)
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
