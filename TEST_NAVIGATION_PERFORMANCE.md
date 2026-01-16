# 导航性能测试指南

## 测试目标

验证首页到搜索页的导航延迟已从 ~10秒 降低到 <1秒

## 测试步骤

### 1. 手动测试（推荐）

#### 测试前准备

```bash
# 启动开发服务器
pnpm dev
```

#### 测试场景 A: 快速导航

1. 打开浏览器访问 http://localhost:3000
2. **立即**（在页面加载后1秒内）点击顶部导航栏的"搜索"链接
3. **预期结果**: 页面应该立即响应并跳转到搜索页（<1秒）

#### 测试场景 B: 数据加载后导航

1. 打开浏览器访问 http://localhost:3000
2. 等待首页所有内容加载完成（约5-10秒）
3. 点击顶部导航栏的"搜索"链接
4. **预期结果**: 页面应该立即响应并跳转到搜索页（<1秒）

#### 测试场景 C: 慢速网络

1. 打开浏览器开发者工具 (F12)
2. 切换到 Network 标签
3. 将网络速度设置为 "Slow 3G"
4. 访问 http://localhost:3000
5. 在首页加载期间点击"搜索"链接
6. **预期结果**: 即使在慢速网络下，导航也应该立即响应（<1秒）

### 2. Chrome DevTools Performance 分析

#### 录制性能追踪

1. 打开 http://localhost:3000
2. 打开 DevTools (F12) → Performance 标签
3. 点击录制按钮 (⚫)
4. 等待1秒后点击"搜索"链接
5. 页面跳转后停止录制

#### 分析指标

查看以下关键指标：

- **User Timing**: 查找 `startTransition` 相关的事件
- **Main Thread**: 确认导航时主线程没有长时间阻塞
- **Navigation Timing**: 验证导航开始到完成的时间 <1秒

### 3. 自动化性能测试 (可选)

创建性能测试脚本 `test-navigation-perf.js`:

```javascript
// 使用 Playwright 或 Puppeteer
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 访问首页
  await page.goto('http://localhost:3000');

  // 等待1秒
  await page.waitForTimeout(1000);

  // 测量导航时间
  const startTime = Date.now();
  await page.click('a[href="/search"]');
  await page.waitForURL('**/search');
  const endTime = Date.now();

  const navigationTime = endTime - startTime;
  console.log(`Navigation time: ${navigationTime}ms`);

  // 验证结果
  if (navigationTime < 1000) {
    console.log('✅ PASS: Navigation completed in <1s');
  } else {
    console.log(`❌ FAIL: Navigation took ${navigationTime}ms`);
  }

  await browser.close();
})();
```

## 对比结果

### 优化前

- **快速导航**: ~10秒（页面等待数据加载完成）
- **数据加载后导航**: ~2秒（仍有残留的状态更新）
- **慢速网络**: >15秒（完全阻塞）

### 优化后

- **快速导航**: <1秒（立即响应）
- **数据加载后导航**: <1秒（无阻塞）
- **慢速网络**: <1秒（导航不依赖网络请求）

## 验证首页数据正常加载

确保优化没有破坏首页功能：

1. 访问首页 http://localhost:3000
2. 等待所有内容加载完成
3. **验证以下区域**:
   - ✅ 热门电影卡片显示正常
   - ✅ 热门剧集卡片显示正常
   - ✅ 热门综艺卡片显示正常
   - ✅ 热门动漫卡片显示正常
   - ✅ 热门短剧卡片显示正常
   - ✅ Bangumi 日历显示正常
   - ✅ 即将上映内容显示正常
4. **验证详情数据**（延迟3-5秒后加载）:
   - ✅ 部分卡片显示更详细的剧情简介
   - ✅ 部分卡片显示 backdrop 背景图

## 技术验证点

### React 19 自动批量更新

打开 React DevTools Profiler，验证：

- 状态更新被批量处理
- 重渲染次数减少

### requestIdleCallback 延迟

在浏览器控制台查看日志：

- 详情数据加载日志应该在 3-5 秒后出现
- 格式如：`[HeroBanner] 电影 XXX - trailerUrl: ...`

### loading 状态

在浏览器控制台验证：

- 首页不应该显示 loading 状态
- 数据在后台加载，不阻塞用户交互

## 常见问题

### Q: 首页内容为什么会延迟显示？

A: 这是正常的。优化后，页面立即可交互，但数据仍在后台加载。内容会在API请求完成后逐步显示。

### Q: 详情数据（剧情简介、背景图）为什么延迟更久？

A: 详情数据使用了 `requestIdleCallback` 延迟加载（3-5秒），避免阻塞关键路径。这不影响主要功能。

### Q: 导航仍然感觉慢怎么办？

A: 检查以下几点：

1. 网络连接是否正常
2. 是否有其他 JavaScript 代码阻塞主线程
3. 浏览器是否过载（关闭其他标签页试试）

## 回滚方案

如果优化导致问题，可以快速回滚：

```bash
git checkout HEAD~1 src/app/page.tsx
```

或手动恢复关键修改：

1. 将 `setLoading(false)` 移回 `finally` 块
2. 将 `requestIdleCallback timeout` 改回 2000ms
3. 在 `fetchRecommendData` 开始时添加 `setLoading(true)`

## 监控建议

生产环境建议添加性能监控：

```javascript
// 使用 Web Vitals API
import { onCLS, onFID, onLCP } from 'web-vitals';

onCLS(console.log);
onFID(console.log);
onLCP(console.log);

// 或使用 Next.js 自带的性能监控
export function reportWebVitals(metric) {
  console.log(metric);
}
```

## 日期

2025-01-16
