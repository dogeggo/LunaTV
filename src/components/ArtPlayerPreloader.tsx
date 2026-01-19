'use client';

import { useEffect } from 'react';

export default function ArtPlayerPreloader() {
  useEffect(() => {
    // 延迟执行预加载，避免阻塞首屏关键资源加载
    // 等待页面主要内容渲染完成后再加载播放器模块
    const timer = setTimeout(() => {
      // 检查是否已经加载过
      if (
        (window as any).DynamicArtplayer &&
        (window as any).DynamicArtplayerPluginDanmuku
      ) {
        return;
      }

      console.log('🚀 开始预加载 ArtPlayer 模块...');
      Promise.all([
        import(/* webpackPreload: false */ 'artplayer'),
        import(/* webpackPreload: false */ 'artplayer-plugin-danmuku'),
      ])
        .then(
          ([{ default: Artplayer }, { default: artplayerPluginDanmuku }]) => {
            // 将导入的模块设置为全局变量供后续使用
            (window as any).DynamicArtplayer = Artplayer;
            (window as any).DynamicArtplayerPluginDanmuku =
              artplayerPluginDanmuku;
            console.log('✅ ArtPlayer 模块预加载完成 (首页)');
          },
        )
        .catch((error) => {
          console.error('⚠️ ArtPlayer 预加载失败:', error);
        });
    }, 3000); // 3秒后预加载，给予首屏充足的渲染时间

    return () => clearTimeout(timer);
  }, []);

  return null;
}
