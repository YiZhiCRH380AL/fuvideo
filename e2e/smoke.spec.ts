import { expect, test } from '@playwright/test'

test('播放器外壳能加载并显示运行环境', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('futurevideo')).toBeVisible()
  await expect(page.getByTestId('backend-status')).toContainText('浏览器')
  await expect(page.getByTestId('time-display')).toHaveText('0:00 / 0:00')
})

test('浏览器环境下打开按钮不可用，避免误导用户', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: '选择视频文件' })).toBeDisabled()
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
