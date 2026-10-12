/**
 * 构建时注入的版本号，来源是 package.json（见 vite.config.ts）。
 *
 * 只用它显示，不做判断——要比较版本请比较后端报出来的那个。
 */
declare const __APP_VERSION__: string
