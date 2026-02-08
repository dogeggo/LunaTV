'use client';

import React from 'react';

import { SearchResult } from '@/lib/types';

import EpisodeSelector from '@/components/EpisodeSelector';
import SkipController from '@/components/SkipController';

interface VideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
}

interface PlayPlayerPanelProps {
  artRef: React.RefObject<HTMLDivElement>;
  isEpisodeSelectorCollapsed: boolean;
  currentSource: string;
  currentId: string;
  detailTitle?: string;
  totalEpisodes: number;
  episodesTitles: string[];
  currentEpisodeIndex: number;
  onEpisodeChange: (episodeNumber: number) => void;
  onSourceChange: (source: string, id: string, title: string) => void;
  searchTitle?: string;
  videoTitle: string;
  availableSources: SearchResult[];
  sourceSearchLoading: boolean;
  sourceSearchError?: string | null;
  precomputedVideoInfo?: Map<string, VideoInfo>;
  speedTestResetKey?: number;
  speedTestEnabled?: boolean;
  isVideoLoading: boolean;
  videoLoadingStage: 'initing' | 'sourceChanging';
  isSkipSettingOpen: boolean;
  onSkipSettingChange: (open: boolean) => void;
  artPlayerRef: React.MutableRefObject<any>;
  currentPlayTime: number;
  videoDuration: number;
  onNextEpisode: () => void;
}

const PlayPlayerPanel = ({
  artRef,
  isEpisodeSelectorCollapsed,
  currentSource,
  currentId,
  detailTitle,
  totalEpisodes,
  episodesTitles,
  currentEpisodeIndex,
  onEpisodeChange,
  onSourceChange,
  searchTitle,
  videoTitle,
  availableSources,
  sourceSearchLoading,
  sourceSearchError,
  precomputedVideoInfo,
  speedTestResetKey,
  speedTestEnabled,
  isVideoLoading,
  videoLoadingStage,
  isSkipSettingOpen,
  onSkipSettingChange,
  artPlayerRef,
  currentPlayTime,
  videoDuration,
  onNextEpisode,
}: PlayPlayerPanelProps) => {
  return (
    <div
      className={`grid gap-4 lg:h-125 xl:h-162.5 2xl:h-187.5 transition-all duration-300 ease-in-out ${
        isEpisodeSelectorCollapsed
          ? 'grid-cols-1'
          : 'grid-cols-1 md:grid-cols-4'
      }`}
    >
      {/* 播放器 */}
      <div
        className={`h-full transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${
          isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
        }`}
      >
        <div className='relative w-full h-75 lg:h-full'>
          <div
            ref={artRef}
            className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
          ></div>

          {/* 跳过设置按钮 - 播放器内右上角 */}
          {currentSource && currentId && (
            <div className='absolute top-4 right-4 z-10'>
              <button
                onClick={() => onSkipSettingChange(true)}
                className='group flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 hover:border-white/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.18)] hover:scale-105 transition-all duration-300 ease-out'
                title='跳过设置'
                style={{
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                }}
              >
                <svg
                  className='w-5 h-5 text-white drop-shadow-lg group-hover:rotate-90 transition-all duration-300'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
                  />
                </svg>
                <span className='text-sm font-medium text-white drop-shadow-lg transition-all duration-300 hidden sm:inline'>
                  跳过设置
                </span>
              </button>
            </div>
          )}

          {/* SkipController 组件 */}
          {currentSource && currentId && detailTitle && (
            <SkipController
              source={currentSource}
              id={currentId}
              title={detailTitle}
              episodeIndex={currentEpisodeIndex}
              artPlayerRef={artPlayerRef}
              currentTime={currentPlayTime}
              duration={videoDuration}
              isSettingMode={isSkipSettingOpen}
              onSettingModeChange={onSkipSettingChange}
              onNextEpisode={onNextEpisode}
            />
          )}

          {/* 换源加载蒙层 */}
          {isVideoLoading && (
            <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-500 transition-all duration-300'>
              <div className='text-center max-w-md mx-auto px-6'>
                {/* 动画影院图标 */}
                <div className='relative mb-8'>
                  <div className='relative mx-auto w-24 h-24 bg-linear-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                    <div className='text-white text-4xl'>🎬</div>
                    {/* 旋转光环 */}
                    <div className='absolute -inset-2 bg-linear-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                  </div>

                  {/* 浮动粒子效果 */}
                  <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                    <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                    <div
                      className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                      style={{ animationDelay: '0.5s' }}
                    ></div>
                    <div
                      className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                      style={{ animationDelay: '1s' }}
                    ></div>
                  </div>
                </div>

                {/* 换源消息 */}
                <div className='space-y-2'>
                  <p className='text-xl font-semibold text-white animate-pulse'>
                    {videoLoadingStage === 'sourceChanging'
                      ? '🔄 切换播放源...'
                      : '🔄 视频加载中...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 选集和换源 - 在移动端始终显示，在 lg 及以上可折叠 */}
      <div
        className={`h-75 lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${
          isEpisodeSelectorCollapsed
            ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
            : 'md:col-span-1 lg:opacity-100 lg:scale-100'
        }`}
      >
        <EpisodeSelector
          totalEpisodes={totalEpisodes}
          episodes_titles={episodesTitles}
          value={currentEpisodeIndex + 1}
          onChange={onEpisodeChange}
          onSourceChange={onSourceChange}
          currentSource={currentSource}
          currentId={currentId}
          videoTitle={searchTitle || videoTitle}
          availableSources={availableSources}
          sourceSearchLoading={sourceSearchLoading}
          sourceSearchError={sourceSearchError}
          precomputedVideoInfo={precomputedVideoInfo}
          speedTestResetKey={speedTestResetKey}
          speedTestEnabled={speedTestEnabled}
        />
      </div>
    </div>
  );
};

export default PlayPlayerPanel;
