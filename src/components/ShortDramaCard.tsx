'use client';

import { Heart, Play, Star } from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';

import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { ShortDramaItem } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

interface ShortDramaCardProps {
  drama: ShortDramaItem;
  showDescription?: boolean;
  className?: string;
  priority?: boolean;
}

function ShortDramaCard({
  drama,
  showDescription = false,
  className = '',
  priority = false,
}: ShortDramaCardProps) {
  // 直接使用 props 中的 episode_count，不再尝试异步获取真实集数
  const realEpisodeCount = drama.episode_count;
  const showEpisodeCount = drama.episode_count > 1;
  const [imageLoaded, setImageLoaded] = useState(false); // 图片加载状态
  const [favorited, setFavorited] = useState(false); // 收藏状态
  // 🚀 性能优化：延迟加载收藏状态
  const [shouldCheckStatus, setShouldCheckStatus] = useState(false);

  // 短剧的source固定为shortdrama
  const source = 'shortdrama';
  const id = drama.id.toString(); // 转换为字符串

  // 检查收藏状态
  useEffect(() => {
    if (!shouldCheckStatus) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(source, id);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    };

    fetchFavoriteStatus();

    // 监听收藏状态更新事件
    const storageKey = generateStorageKey(source, id);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        const isNowFavorited = !!newFavorites[storageKey];
        setFavorited(isNowFavorited);
      },
    );

    return unsubscribe;
  }, [source, id, shouldCheckStatus]);

  // 处理收藏切换
  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        if (favorited) {
          // 取消收藏
          await deleteFavorite(source, id);
          setFavorited(false);
        } else {
          // 添加收藏
          await saveFavorite(source, id, {
            title: drama.name,
            source_name: '短剧',
            year: '',
            cover: drama.cover,
            total_episodes: realEpisodeCount,
            save_time: Date.now(),
            search_title: drama.name,
          });
          setFavorited(true);
        }
      } catch (err) {
        console.error('切换收藏状态失败:', err);
      }
    },
    [favorited, source, id, drama.name, drama.cover, realEpisodeCount],
  );

  const formatScore = (score: number) => {
    return score > 0 ? score.toFixed(1) : '--';
  };

  const formatUpdateTime = (updateTime: string) => {
    try {
      const date = new Date(updateTime);
      return date.toLocaleDateString('zh-CN');
    } catch {
      return updateTime;
    }
  };

  return (
    <div
      className={`group relative ${className} transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-30 hover:shadow-2xl`}
      onMouseEnter={() => setShouldCheckStatus(true)}
      onTouchStart={() => setShouldCheckStatus(true)}
      onFocus={() => setShouldCheckStatus(true)}
    >
      <Link
        href={`/play?title=${encodeURIComponent(drama.name)}&shortdrama_id=${drama.id}`}
        className='block'
      >
        {/* 封面图片 */}
        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800'>
          {/* 渐变光泽动画层 */}
          <div
            className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
            style={{
              background:
                'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
              backgroundSize: '200% 100%',
              animation: 'card-shimmer 2.5s ease-in-out infinite',
            }}
          />

          <img
            src={processImageUrl(drama.cover)}
            alt={drama.name}
            className={`h-full w-full object-cover transition-all duration-700 ease-out ${
              imageLoaded
                ? 'opacity-100 blur-0 scale-100 group-hover:scale-105'
                : 'opacity-0 blur-md scale-105'
            }`}
            loading={priority ? 'eager' : 'lazy'}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              // 重试失败，使用通用占位图
              img.src =
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect fill="%23374151" width="200" height="300"/%3E%3Cg fill="%239CA3AF"%3E%3Cpath d="M100 80 L100 120 M80 100 L120 100" stroke="%239CA3AF" stroke-width="8" stroke-linecap="round"/%3E%3Crect x="60" y="140" width="80" height="100" rx="5" fill="none" stroke="%239CA3AF" stroke-width="4"/%3E%3Cpath d="M70 160 L90 180 L130 140" stroke="%239CA3AF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/%3E%3C/g%3E%3Ctext x="100" y="270" font-family="Arial" font-size="12" fill="%239CA3AF" text-anchor="middle"%3E暂无海报%3C/text%3E%3C/svg%3E';
              setImageLoaded(true);
            }}
          />

          {/* 悬浮播放按钮 - 玻璃态效果 */}
          <div className='absolute inset-0 flex items-center justify-center bg-linear-to-t from-black/80 via-black/20 to-transparent backdrop-blur-[2px] opacity-0 transition-all duration-300 group-hover:opacity-100'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110'>
              <Play className='h-5 w-5 ml-0.5' fill='currentColor' />
            </div>
          </div>

          {/* 集数标识 - Netflix 统一风格 - 只在集数>1时显示 */}
          {showEpisodeCount && (
            <div className='absolute top-2 left-2 flex items-center overflow-hidden rounded-md shadow-lg transition-all duration-300 ease-out group-hover:scale-105 bg-black/70 backdrop-blur-sm px-2 py-0.5'>
              <span className='flex items-center text-[10px] font-medium text-white/80'>
                {realEpisodeCount} 集
              </span>
            </div>
          )}

          {/* 评分 - 使用vote_average字段 */}
          {drama.vote_average && drama.vote_average > 0 && (
            <div className='absolute top-2 right-2 flex items-center rounded-lg bg-linear-to-br from-yellow-400 to-orange-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-sm ring-2 ring-white/30 transition-all duration-300 group-hover:scale-110'>
              <Star className='h-3 w-3 mr-1 fill-current' />
              {drama.vote_average.toFixed(1)}
            </div>
          )}

          {/* 收藏按钮 - 右下角 */}
          <button
            onClick={handleToggleFavorite}
            className='absolute bottom-2 right-2 h-8 w-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm opacity-0 transition-all duration-300 group-hover:opacity-100 hover:scale-110 hover:bg-black/70 z-20'
            aria-label={favorited ? '取消收藏' : '添加收藏'}
          >
            <Heart
              className={`h-4 w-4 transition-all duration-300 ${
                favorited
                  ? 'fill-red-500 text-red-500 scale-110'
                  : 'text-white hover:text-red-400'
              }`}
            />
          </button>
        </div>

        {/* 信息区域 */}
        <div className='mt-2 space-y-1.5'>
          <h3 className='text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-blue-600 group-hover:to-purple-600 dark:group-hover:from-blue-400 dark:group-hover:to-purple-400 transition-all duration-300'>
            {drama.name}
          </h3>

          {/* 演员信息 */}
          {drama.author && (
            <div className='flex items-center gap-1.5 text-xs'>
              <div className='flex items-center gap-1 px-2 py-0.5 rounded-full bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/50 dark:border-blue-700/50'>
                <svg
                  className='w-3 h-3 text-blue-600 dark:text-blue-400'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                  ></path>
                </svg>
                <span className='text-blue-700 dark:text-blue-300 font-medium line-clamp-1'>
                  {drama.author}
                </span>
              </div>
            </div>
          )}

          <div className='flex items-center gap-1.5 text-xs'>
            <div className='flex items-center gap-1 px-2 py-0.5 rounded-full bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200/50 dark:border-green-700/50'>
              <svg
                className='w-3 h-3 text-green-600 dark:text-green-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                ></path>
              </svg>
              <span className='text-green-700 dark:text-green-300 font-medium'>
                {formatUpdateTime(drama.update_time)}
              </span>
            </div>
          </div>

          {/* 描述信息（可选） */}
          {showDescription && drama.description && (
            <p className='text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1'>
              {drama.description}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

export default memo(ShortDramaCard);
