import { expect, test, type Page } from '@playwright/test'

/** 等开屏退场：浮层没走之前底下的界面是隐着的，也点不动。 */
async function waitForBoot(page: Page): Promise<void> {
  await expect(page.locator('.app')).toHaveAttribute('data-splash', 'done', { timeout: 8000 })
  await expect(page.getByTestId('splash')).toHaveCount(0)
}

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

test('侧边栏默认收起，点按钮后展开', async ({ page }) => {
  await page.goto('/')
  await waitForBoot(page)

  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toHaveAttribute('data-open', 'false')

  await page.getByRole('button', { name: '视频库' }).click()

  await expect(sidebar).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('sidebar-directory')).toHaveText('还没有选择目录')

  // 展开带 220ms 过渡，等它稳定后再量宽度
  await expect
    .poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)), {
      timeout: 2000,
    })
    .toBeGreaterThan(200)
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
