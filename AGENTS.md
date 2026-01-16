# Repository Guidelines

## Project Structure & Module Organization
- `src\app`：Next.js App Router，页面与路由使用 `page.tsx`、`layout.tsx`、`route.ts`。
- `src\components`：可复用 UI 组件，使用 PascalCase 命名（如 `HeroBanner.tsx`）。
- `src\contexts`、`src\hooks`、`src\lib`、`src\styles`、`src\types`：分别存放上下文、Hook、通用工具、样式与类型定义。
- `public`：静态资源；`scripts`：构建辅助脚本（如 `scripts\generate-manifest.js`）。

## Build, Test, and Development Commands
- `pnpm install`：安装依赖（仓库固定 `pnpm@10.14.0`）。
- `pnpm dev`：生成 manifest 后启动本地开发服务器（监听 `0.0.0.0`）。
- `pnpm build` / `pnpm start`：构建并以生产模式运行。
- `pnpm lint`、`pnpm lint:strict`、`pnpm lint:fix`：代码规范检查与自动修复。
- `pnpm typecheck`：TypeScript 静态检查（不生成产物）。
- `pnpm test` / `pnpm test:watch`：运行 Jest 测试。
- `pnpm format` / `pnpm format:check`：Prettier 格式化与校验。

## Coding Style & Naming Conventions
- 使用 TypeScript + React + Next.js；路径别名 `@/` 指向 `src`，`~/` 指向 `public`。
- Prettier：2 空格缩进、单引号、JSX 单引号、分号结尾。
- ESLint（`eslint.config.mjs`）启用 import 排序与未使用导入检查，避免提交调试用 `console`。
- 命名规则：组件 PascalCase，Hook 使用 `useX`；`src\app` 路由目录保持既有风格（连字符或下划线）并在同一功能内保持一致。

## Testing Guidelines
- Jest + React Testing Library，环境为 `jsdom`，自定义配置在 `jest.setup.js`。
- 测试可就近放在同目录，命名建议 `*.test.tsx` 或 `*.spec.tsx`；需要时在 `src\__mocks__` 放置 mock。

## Commit & Pull Request Guidelines
- 提交信息遵循 Conventional Commits，允许类型：`feat`、`fix`、`docs`、`chore`、`refactor`、`test`、`perf`、`ci`、`style`、`revert`、`vercel`。
- Husky 在提交时运行 `lint-staged` 与 `commitlint`，确保 lint 与格式化通过。
- PR 需包含变更摘要、测试说明；涉及 UI 变更时请附截图，并关联相关 Issue。

## Security & Configuration Tips
- 与鉴权或代理相关的变更请先阅读 `OIDC_SETUP.md`、`PROXY_CONFIG.md`、`TVBOX_SECURITY.md` 等说明。
- 机密信息使用 `.env.local` 管理，禁止提交到仓库。
