'use client';

import { RefreshCw } from 'lucide-react';

import DownloadButtons from '@/components/play/DownloadButtons';

interface PlayToolbarProps {
  netdiskLoading: boolean;
  netdiskTotal: number;
  onOpenNetdisk: () => void;
  downloadEnabled: boolean;
  onDownloadClick: () => void;
  onDownloadPanelClick: () => void;
  onRetest: () => void;
  retestDisabled: boolean;
  isSpeedTestRunning: boolean;
  isEpisodeSelectorCollapsed: boolean;
  onToggleEpisodeSelector: () => void;
}

const PlayToolbar = ({
  netdiskLoading,
  netdiskTotal,
  onOpenNetdisk,
  downloadEnabled,
  onDownloadClick,
  onDownloadPanelClick,
  onRetest,
  retestDisabled,
  isSpeedTestRunning,
  isEpisodeSelectorCollapsed,
  onToggleEpisodeSelector,
}: PlayToolbarProps) => {
  return (
    <div className='flex justify-end items-center gap-2 sm:gap-3'>
      {/* 网盘资源按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenNetdisk();
        }}
        className='flex group relative items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-10 sm:min-h-11 rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
        title='网盘资源'
      >
        <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
        <span className='relative z-10 text-sm sm:text-base'>📁</span>
        <span className='relative z-10 hidden sm:inline text-xs font-medium text-gray-600 dark:text-gray-300'>
          {netdiskLoading ? (
            <span className='flex items-center gap-1'>
              <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin'></span>
              搜索中
            </span>
          ) : netdiskTotal > 0 ? (
            `网盘 (${netdiskTotal})`
          ) : (
            '网盘'
          )}
        </span>

        {/* 状态指示点 */}
        {netdiskTotal > 0 && (
          <div className='absolute -top-0.5 -right-0.5 z-20'>
            <div className='relative'>
              <div className='absolute inset-0 bg-primary-400 rounded-full blur-sm opacity-75 animate-pulse'></div>
              <div className='relative w-2 h-2 rounded-full bg-linear-to-br from-primary-400 to-primary-500 shadow-lg'></div>
            </div>
          </div>
        )}
      </button>

      {/* 下载按钮 - 使用独立组件优化性能 */}
      <DownloadButtons
        downloadEnabled={downloadEnabled}
        onDownloadClick={onDownloadClick}
        onDownloadPanelClick={onDownloadPanelClick}
      />

      {/* 重新测速按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRetest();
        }}
        disabled={retestDisabled}
        className='flex group relative items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-10 sm:min-h-11 rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed'
        title={isSpeedTestRunning ? '测速中...' : '重新测速'}
      >
        <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
        <RefreshCw
          className={`relative z-10 w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-600 dark:text-gray-400 ${
            isSpeedTestRunning ? 'animate-spin' : ''
          }`}
        />
        <span className='relative z-10 hidden sm:inline text-xs font-medium text-gray-600 dark:text-gray-300'>
          {isSpeedTestRunning ? '测速中' : '重新测速'}
        </span>
      </button>

      {/* 折叠控制按钮 - 仅在 lg 及以上屏幕显示 */}
      <button
        onClick={onToggleEpisodeSelector}
        className='hidden lg:flex group relative items-center gap-2 px-4 py-2 min-h-11 rounded-2xl bg-linear-to-br from-white/90 via-white/80 to-white/70 hover:from-white hover:via-white/95 hover:to-white/90 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 dark:hover:from-gray-800 dark:hover:via-gray-800/95 dark:hover:to-gray-800/90 backdrop-blur-md border border-white/60 dark:border-gray-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.25)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.3)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden'
        title={isEpisodeSelectorCollapsed ? '显示选集面板' : '隐藏选集面板'}
      >
        <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/10 transition-all duration-500'></div>
        <svg
          className={`relative z-10 w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
          }`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            d='M9 5l7 7-7 7'
          />
        </svg>
        <span className='relative z-10 text-xs font-medium text-gray-600 dark:text-gray-300'>
          {isEpisodeSelectorCollapsed ? '显示' : '隐藏'}
        </span>

        {/* 精致的状态指示点 */}
        <div className='absolute -top-0.5 -right-0.5 z-20'>
          <div className='relative'>
            <div
              className={`absolute inset-0 rounded-full blur-sm opacity-75 ${
                isEpisodeSelectorCollapsed
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-green-400'
              }`}
            ></div>
            <div
              className={`relative w-2 h-2 rounded-full shadow-lg ${
                isEpisodeSelectorCollapsed
                  ? 'bg-linear-to-br from-orange-400 to-orange-500'
                  : 'bg-linear-to-br from-green-400 to-green-500'
              }`}
            ></div>
          </div>
        </div>
      </button>
    </div>
  );
};

export default PlayToolbar;
