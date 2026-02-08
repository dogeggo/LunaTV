'use client';

import { useState } from 'react';

import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import CommentSection from '@/components/play/CommentSection';
import FavoriteButton from '@/components/play/FavoriteButton';
import VideoCard from '@/components/VideoCard';

interface PlayDetailsSectionProps {
  detail: SearchResult | null;
  videoTitle: string;
  videoYear: string;
  videoDoubanId: number;
  movieDetails: any;
  bangumiDetails: any;
  loadingMovieDetails: boolean;
  loadingBangumiDetails: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
  movieComments: any[];
  loadingComments: boolean;
  commentsError: string | null;
  selectedCelebrityName: string | null;
  celebrityWorks: any[];
  loadingCelebrityWorks: boolean;
  onCelebrityClick: (name: string) => void;
  onCelebrityClose: () => void;
  videoCover: string;
}

const PlayDetailsSection = ({
  detail,
  videoTitle,
  videoYear,
  videoDoubanId,
  movieDetails,
  bangumiDetails,
  loadingMovieDetails,
  loadingBangumiDetails,
  favorited,
  onToggleFavorite,
  movieComments,
  loadingComments,
  commentsError,
  selectedCelebrityName,
  celebrityWorks,
  loadingCelebrityWorks,
  onCelebrityClick,
  onCelebrityClose,
  videoCover,
}: PlayDetailsSectionProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
      {/* 文字区 */}
      <div className='md:col-span-3'>
        <div className='p-6 flex flex-col min-h-0'>
          {/* 标题 */}
          <div className='mb-4 shrink-0'>
            <div className='flex flex-col md:flex-row md:items-center gap-3'>
              <h1 className='text-2xl md:text-3xl font-bold tracking-wide text-center md:text-left bg-linear-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent'>
                {videoTitle || '影片标题'}
              </h1>

              {/* 按钮组 */}
              <div className='flex items-center justify-center md:justify-start gap-2 flex-wrap'>
                {/* 收藏按钮 - 使用独立组件优化性能 */}
                <FavoriteButton
                  favorited={favorited}
                  onToggle={onToggleFavorite}
                />
              </div>
            </div>
          </div>

          {/* 关键信息行 */}
          <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 shrink-0'>
            {detail?.class && String(detail.class) !== '0' && (
              <span className='text-green-600 font-semibold'>
                {detail.class}
              </span>
            )}
            {(detail?.year || videoYear) && (
              <span>{detail?.year || videoYear}</span>
            )}
            {detail?.source_name && (
              <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                {detail.source_name}
              </span>
            )}
            {detail?.type_name && <span>{detail.type_name}</span>}
          </div>

          {/* 详细信息（豆瓣或bangumi） */}
          {videoDoubanId !== 0 && detail && (
            <div className='mb-4 shrink-0'>
              {/* 加载状态 */}
              {(loadingMovieDetails || loadingBangumiDetails) &&
                !movieDetails &&
                !bangumiDetails && (
                  <div className='animate-pulse'>
                    <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                    <div className='h-4 bg-gray-300 rounded w-48'></div>
                  </div>
                )}

              {/* Bangumi详情 */}
              {bangumiDetails && (
                <div className='space-y-2 text-sm'>
                  {/* Bangumi评分 */}
                  {bangumiDetails.rating?.score &&
                    parseFloat(bangumiDetails.rating.score) > 0 && (
                      <div className='flex items-center gap-2'>
                        <span className='font-semibold text-gray-700 dark:text-gray-300'>
                          Bangumi评分:{' '}
                        </span>
                        <div className='flex items-center group'>
                          <span className='relative text-transparent bg-clip-text bg-linear-to-r from-pink-600 via-rose-600 to-pink-600 dark:from-pink-400 dark:via-rose-400 dark:to-pink-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(236,72,153,0.5)]'>
                            {bangumiDetails.rating.score}
                          </span>
                          <div className='flex ml-2 gap-0.5'>
                            {[...Array(5)].map((_, i) => (
                              <svg
                                key={i}
                                className={`w-4 h-4 transition-all duration-300 ${
                                  i <
                                  Math.floor(
                                    parseFloat(bangumiDetails.rating.score) / 2,
                                  )
                                    ? 'text-pink-500 drop-shadow-[0_0_4px_rgba(236,72,153,0.5)] group-hover:scale-110'
                                    : 'text-gray-300 dark:text-gray-600'
                                }`}
                                fill='currentColor'
                                viewBox='0 0 20 20'
                                style={{
                                  transitionDelay: `${i * 50}ms`,
                                }}
                              >
                                <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                              </svg>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* 制作信息从infobox提取 */}
                  {bangumiDetails.infobox &&
                    bangumiDetails.infobox.map((info: any, index: number) => {
                      if (info.key === '导演' && info.value) {
                        const directors = Array.isArray(info.value)
                          ? info.value.map((v: any) => v.v || v).join('、')
                          : info.value;
                        return (
                          <div key={index}>
                            <span className='font-semibold text-gray-700 dark:text-gray-300'>
                              导演:{' '}
                            </span>
                            <span className='text-gray-600 dark:text-gray-400'>
                              {directors}
                            </span>
                          </div>
                        );
                      }
                      if (info.key === '制作' && info.value) {
                        const studios = Array.isArray(info.value)
                          ? info.value.map((v: any) => v.v || v).join('、')
                          : info.value;
                        return (
                          <div key={index}>
                            <span className='font-semibold text-gray-700 dark:text-gray-300'>
                              制作:{' '}
                            </span>
                            <span className='text-gray-600 dark:text-gray-400'>
                              {studios}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })}

                  {/* 播出日期 */}
                  {bangumiDetails.date && (
                    <div>
                      <span className='font-semibold text-gray-700 dark:text-gray-300'>
                        播出日期:{' '}
                      </span>
                      <span className='text-gray-600 dark:text-gray-400'>
                        {bangumiDetails.date}
                      </span>
                    </div>
                  )}

                  {/* 标签信息 */}
                  <div className='flex flex-wrap gap-2 mt-3'>
                    {bangumiDetails.tags &&
                      bangumiDetails.tags
                        .slice(0, 4)
                        .map((tag: any, index: number) => (
                          <span
                            key={index}
                            className='relative group bg-linear-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'
                          >
                            <span className='absolute inset-0 bg-linear-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{tag.name}</span>
                          </span>
                        ))}
                    {bangumiDetails.total_episodes && (
                      <span className='relative group bg-linear-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                        <span className='absolute inset-0 bg-linear-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                        <span className='relative'>
                          共{bangumiDetails.total_episodes}话
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 豆瓣详情 */}
              {movieDetails && (
                <div className='space-y-2 text-sm'>
                  {/* 豆瓣评分 */}
                  {movieDetails.rate &&
                    movieDetails.rate !== '0' &&
                    parseFloat(movieDetails.rate) > 0 && (
                      <div className='flex items-center gap-2'>
                        <span className='font-semibold text-gray-700 dark:text-gray-300'>
                          豆瓣评分:{' '}
                        </span>
                        <div className='flex items-center group'>
                          <span className='relative text-transparent bg-clip-text bg-linear-to-r from-yellow-600 via-amber-600 to-yellow-600 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'>
                            {movieDetails.rate}
                          </span>
                          <div className='flex ml-2 gap-0.5'>
                            {[...Array(5)].map((_, i) => (
                              <svg
                                key={i}
                                className={`w-4 h-4 transition-all duration-300 ${
                                  i <
                                  Math.floor(parseFloat(movieDetails.rate) / 2)
                                    ? 'text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)] group-hover:scale-110'
                                    : 'text-gray-300 dark:text-gray-600'
                                }`}
                                fill='currentColor'
                                viewBox='0 0 20 20'
                                style={{
                                  transitionDelay: `${i * 50}ms`,
                                }}
                              >
                                <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                              </svg>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* 导演 */}
                  {movieDetails.directors &&
                    movieDetails.directors.length > 0 && (
                      <div>
                        <span className='font-semibold text-gray-700 dark:text-gray-300'>
                          导演:{' '}
                        </span>
                        <span className='text-gray-600 dark:text-gray-400'>
                          {movieDetails.directors.join('、')}
                        </span>
                      </div>
                    )}

                  {/* 编剧 */}
                  {movieDetails.screenwriters &&
                    movieDetails.screenwriters.length > 0 && (
                      <div>
                        <span className='font-semibold text-gray-700 dark:text-gray-300'>
                          编剧:{' '}
                        </span>
                        <span className='text-gray-600 dark:text-gray-400'>
                          {movieDetails.screenwriters.join('、')}
                        </span>
                      </div>
                    )}

                  {/* 主演 */}
                  {movieDetails.cast && movieDetails.cast.length > 0 && (
                    <div>
                      <span className='font-semibold text-gray-700 dark:text-gray-300'>
                        主演:{' '}
                      </span>
                      <span className='text-gray-600 dark:text-gray-400'>
                        {movieDetails.cast.join('、')}
                      </span>
                    </div>
                  )}

                  {/* 首播日期 */}
                  {movieDetails.first_aired && (
                    <div>
                      <span className='font-semibold text-gray-700 dark:text-gray-300'>
                        {movieDetails.episodes ? '首播' : '上映'}:
                      </span>
                      <span className='text-gray-600 dark:text-gray-400'>
                        {movieDetails.first_aired}
                      </span>
                    </div>
                  )}

                  {/* 标签信息 */}
                  <div className='flex flex-wrap gap-2 mt-3'>
                    {movieDetails.countries &&
                      movieDetails.countries
                        .slice(0, 2)
                        .map((country: string, index: number) => (
                          <span
                            key={index}
                            className='relative group bg-linear-to-r from-blue-500/90 to-cyan-500/90 dark:from-blue-600/90 dark:to-cyan-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'
                          >
                            <span className='absolute inset-0 bg-linear-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{country}</span>
                          </span>
                        ))}
                    {movieDetails.languages &&
                      movieDetails.languages
                        .slice(0, 2)
                        .map((language: string, index: number) => (
                          <span
                            key={index}
                            className='relative group bg-linear-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'
                          >
                            <span className='absolute inset-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{language}</span>
                          </span>
                        ))}
                    {movieDetails.episodes && (
                      <span className='relative group bg-linear-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                        <span className='absolute inset-0 bg-linear-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                        <span className='relative'>
                          共{movieDetails.episodes}集
                        </span>
                      </span>
                    )}
                    {movieDetails.episode_length && (
                      <span className='relative group bg-linear-to-r from-orange-500/90 to-amber-500/90 dark:from-orange-600/90 dark:to-amber-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-orange-500/30 transition-all duration-300 hover:scale-105'>
                        <span className='absolute inset-0 bg-linear-to-r from-orange-400 to-amber-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                        <span className='relative'>
                          单集{movieDetails.episode_length}分钟
                        </span>
                      </span>
                    )}
                    {movieDetails.movie_duration && (
                      <span className='relative group bg-linear-to-r from-red-500/90 to-rose-500/90 dark:from-red-600/90 dark:to-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:scale-105'>
                        <span className='absolute inset-0 bg-linear-to-r from-red-400 to-rose-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                        <span className='relative'>
                          {movieDetails.movie_duration}分钟
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 剧情简介 */}
          {(detail?.desc ||
            bangumiDetails?.summary ||
            movieDetails?.plot_summary) && (
            <div
              className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
              style={{ whiteSpace: 'pre-line' }}
            >
              {movieDetails?.plot_summary ||
                bangumiDetails?.summary ||
                detail?.desc}
            </div>
          )}

          {/* 演员阵容 */}
          {movieDetails?.celebrities && movieDetails.celebrities.length > 0 && (
            <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
              <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                <span>🎭</span>
                <span>演员阵容</span>
              </h3>
              <div className='flex gap-4 overflow-x-auto pb-4 scrollbar-hide'>
                {movieDetails.celebrities
                  .slice(0, 15)
                  .map((celebrity: any, index: number) => (
                    <div
                      key={`${celebrity.id}-${celebrity.name}-${index}`}
                      onClick={() => onCelebrityClick(celebrity.name)}
                      className='shrink-0 text-center group cursor-pointer'
                    >
                      <div className='w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-2 ring-2 ring-transparent group-hover:ring-blue-500 transition-all duration-300 group-hover:scale-110 shadow-md group-hover:shadow-xl'>
                        <img
                          src={processImageUrl(celebrity.avatar)}
                          alt={celebrity.name}
                          className='w-full h-full object-cover'
                          loading='lazy'
                          onError={(e) => {
                            console.error(
                              '演员头像加载失败:',
                              celebrity.name,
                              celebrity.avatar,
                              processImageUrl(celebrity.avatar),
                            );
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <p
                        className='text-xs font-medium text-gray-700 dark:text-gray-300 w-20 truncate group-hover:text-blue-500 transition-colors'
                        title={celebrity.name}
                      >
                        {celebrity.name}
                      </p>
                      {celebrity.role && (
                        <p
                          className='text-[10px] text-gray-500 dark:text-gray-500 w-20 truncate mt-0.5'
                          title={celebrity.role}
                        >
                          {celebrity.role}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 演员作品展示 */}
          {selectedCelebrityName && (
            <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
              <div className='flex justify-between items-center mb-4'>
                <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                  <span>🎬</span>
                  <span>{selectedCelebrityName} 的作品</span>
                </h3>
                <button
                  onClick={onCelebrityClose}
                  className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  收起 ✕
                </button>
              </div>

              {loadingCelebrityWorks ? (
                <div className='flex flex-col items-center justify-center py-12'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4'></div>
                  <p className='text-gray-600 dark:text-gray-400'>
                    正在加载作品...
                  </p>
                </div>
              ) : celebrityWorks.length > 0 ? (
                <>
                  <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                    找到 {celebrityWorks.length} 部相关作品
                  </p>
                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                    {celebrityWorks.map((work: any) => {
                      // TMDB作品不传douban_id，仅传title搜索
                      const playUrl =
                        work.source === 'tmdb'
                          ? `/play?title=${encodeURIComponent(work.title)}`
                          : `/play?title=${encodeURIComponent(work.title)}&douban_id=${work.id}`;
                      return (
                        <div
                          key={work.id}
                          ref={(node) => {
                            if (node) {
                              // 移除旧的监听器
                              const oldClick = (node as any)._clickHandler;
                              const oldTouchStart = (node as any)
                                ._touchStartHandler;
                              const oldTouchEnd = (node as any)
                                ._touchEndHandler;
                              if (oldClick)
                                node.removeEventListener(
                                  'click',
                                  oldClick,
                                  true,
                                );
                              if (oldTouchStart)
                                node.removeEventListener(
                                  'touchstart',
                                  oldTouchStart,
                                  true,
                                );
                              if (oldTouchEnd)
                                node.removeEventListener(
                                  'touchend',
                                  oldTouchEnd,
                                  true,
                                );

                              const touchStartHandler = (e: Event) => {
                                const touchEvent = e as TouchEvent;
                                if (touchEvent.touches.length > 1) return; // 多指不处理
                                (node as any)._touchStartTime = Date.now();
                                (node as any)._touchStartX =
                                  touchEvent.touches[0].clientX;
                                (node as any)._touchStartY =
                                  touchEvent.touches[0].clientY;
                              };

                              const touchEndHandler = (e: Event) => {
                                const touchEvent = e as TouchEvent;
                                const touchStartTime = (node as any)
                                  ._touchStartTime;
                                const touchStartX = (node as any)._touchStartX;
                                const touchStartY = (node as any)._touchStartY;
                                if (!touchStartTime) return;
                                const touchDuration =
                                  Date.now() - touchStartTime;

                                const touchEndX =
                                  touchEvent.changedTouches[0]?.clientX || 0;
                                const touchEndY =
                                  touchEvent.changedTouches[0]?.clientY || 0;
                                const moveDistance = Math.sqrt(
                                  Math.pow(touchEndX - touchStartX, 2) +
                                    Math.pow(touchEndY - touchStartY, 2),
                                );

                                // 短按且没有明显滑动
                                if (touchDuration < 300 && moveDistance < 10) {
                                  // 防止长按触发
                                  if (touchDuration > 200) {
                                    return;
                                  }

                                  // 让 VideoCard 的长按菜单正常工作
                                  return;
                                }

                                // 否则是短按，执行跳转
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                window.location.href = playUrl;
                              };

                              const clickHandler = (e: Event) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                window.location.href = playUrl;
                              };

                              node.addEventListener(
                                'touchstart',
                                touchStartHandler,
                                true,
                              );
                              node.addEventListener(
                                'touchend',
                                touchEndHandler,
                                true,
                              );
                              node.addEventListener(
                                'click',
                                clickHandler,
                                true,
                              );

                              // 保存引用以便清理
                              (node as any)._touchStartHandler =
                                touchStartHandler;
                              (node as any)._touchEndHandler = touchEndHandler;
                              (node as any)._clickHandler = clickHandler;
                            }
                          }}
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            touchAction: 'manipulation',
                          }}
                        >
                          <VideoCard
                            id={work.id}
                            title={work.title}
                            poster={work.poster}
                            rate={work.rate}
                            douban_id={parseInt(work.id)}
                            from='douban'
                            isAggregate={true}
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  暂无相关作品
                </p>
              )}
            </div>
          )}

          {/* 豆瓣短评 - 使用独立组件优化性能 */}
          <CommentSection
            comments={movieComments}
            loading={loadingComments}
            error={commentsError}
            videoDoubanId={videoDoubanId}
          />
        </div>
      </div>

      {/* 封面展示 */}
      <div className='hidden md:block md:col-span-1 md:order-first'>
        <div className='pl-0 py-4 pr-6'>
          <div className='group relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]'>
            {videoCover || bangumiDetails?.images?.large ? (
              <>
                {/* 渐变光泽动画层 */}
                <div
                  className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
                  style={{
                    background:
                      'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2.5s ease-in-out infinite',
                  }}
                />

                <img
                  src={processImageUrl(
                    bangumiDetails?.images?.large || videoCover,
                  )}
                  alt={videoTitle}
                  className={`'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105${
                    imageLoaded
                      ? 'opacity-100 blur-0 scale-100'
                      : 'opacity-0 blur-md scale-105'
                  }`}
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.src =
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect fill="%23374151" width="200" height="300"/%3E%3Cg fill="%239CA3AF"%3E%3Cpath d="M100 80 L100 120 M80 100 L120 100" stroke="%239CA3AF" stroke-width="8" stroke-linecap="round"/%3E%3Crect x="60" y="140" width="80" height="100" rx="5" fill="none" stroke="%239CA3AF" stroke-width="4"/%3E%3Cpath d="M70 160 L90 180 L130 140" stroke="%239CA3AF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/%3E%3C/g%3E%3Ctext x="100" y="270" font-family="Arial" font-size="12" fill="%239CA3AF" text-anchor="middle"%3E暂无海报%3C/text%3E%3C/svg%3E';
                    setImageLoaded(true);
                  }}
                />

                {/* 悬浮遮罩 */}
                <div className='absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>

                {/* 链接按钮（bangumi或豆瓣） */}
                {videoDoubanId !== 0 && (
                  <a
                    href={
                      bangumiDetails
                        ? `https://bgm.tv/subject/${videoDoubanId.toString()}`
                        : `https://movie.douban.com/subject/${videoDoubanId.toString()}`
                    }
                    target='_blank'
                    rel='noopener noreferrer'
                    className='absolute top-3 left-3 z-20'
                  >
                    <div
                      className={`relative ${
                        bangumiDetails
                          ? 'bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600'
                          : 'bg-linear-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                      } text-white text-xs font-bold w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 ease-out hover:scale-110 group/link`}
                    >
                      <div
                        className={`absolute inset-0 ${
                          bangumiDetails ? 'bg-pink-400' : 'bg-green-400'
                        } rounded-full opacity-0 group-hover/link:opacity-30 blur transition-opacity duration-300`}
                      ></div>
                      <svg
                        width='18'
                        height='18'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        className='relative z-10'
                      >
                        <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path>
                        <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>
                      </svg>
                    </div>
                  </a>
                )}
              </>
            ) : (
              <span className='text-gray-600 dark:text-gray-400'>封面图片</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayDetailsSection;
