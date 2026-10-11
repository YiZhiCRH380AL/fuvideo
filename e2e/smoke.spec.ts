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
