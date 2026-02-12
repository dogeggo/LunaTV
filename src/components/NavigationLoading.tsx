'use client';

import { useNavigationLoading } from '@/contexts/NavigationLoadingContext';

export default function NavigationLoading() {
  const { isNavigating, navigationTitle } = useNavigationLoading();

  if (!isNavigating) return null;

  return (
    <>
      {/* 顶部进度条 */}
      <div className='fixed top-0 left-0 right-0 z-99999 h-0.5'>
        <div className='h-full bg-linear-to-r from-primary-400 via-emerald-500 to-primary-400 rounded-r-full animate-nav-progress' />
      </div>

      {/* 底部浮动提示 */}
      <div className='fixed bottom-24 sm:bottom-8 left-1/2 z-99999 animate-nav-toast-in'>
        <div className='flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gray-900/80 dark:bg-white/15 backdrop-blur-lg shadow-lg border border-white/10'>
          <div className='w-4 h-4 rounded-full border-2 border-primary-400/30 border-t-primary-400 animate-spin' />
          <span className='text-white text-xs font-medium whitespace-nowrap'>
            {navigationTitle ? `正在加载「${navigationTitle}」` : '正在加载...'}
          </span>
        </div>
      </div>
    </>
  );
}
