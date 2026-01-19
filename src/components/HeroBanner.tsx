'use client';

import {
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAutoplay } from './hooks/useAutoplay';
import { useSwipeGesture } from './hooks/useSwipeGesture';

interface BannerItem {
  id: string | number;
  title: string;
  description?: string;
  poster: string;
  backdrop?: string;
  year?: string;
  rate?: string;
  douban_id?: number;
  type?: string;
  trailerUrl?: string; // 预告片视频URL（可选）
}

interface HeroBannerProps {
  items: BannerItem[];
  autoPlayInterval?: number;
  showControls?: boolean;
  showIndicators?: boolean;
  enableVideo?: boolean; // 是否启用视频自动播放
}

// 内部组件：稳定的视频播放器
// 🌟 优化：使用 Cache API + Blob 实现永久缓存
// 即使 URL 签名变化，只要视频 ID 不变，就直接使用缓存，避免网络请求
const BannerVideo = ({
  src,
  poster,
  isActive,
  isMuted,
  onLoad,
  onError,
}: {
  src: string;
  poster: string;
  isActive: boolean;
  isMuted: boolean;
  onLoad: (e: any) => void;
  onError: (e: any) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // 记录当前正在使用的视频 ID，用于在 ID 变化时清理旧的 Blob
  const currentVideoIdRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // 从 URL 中提取视频 ID (文件名)，用作稳定的 Cache Key
  const getVideoId = useCallback((url: string) => {
    try {
      // 处理代理 URL: /api/video-proxy?url=... 或 /api/video-proxy?id=...
      const urlObj = new URL(url, 'http://localhost');
      const idParam = urlObj.searchParams.get('id');
      if (idParam) return idParam;

      const targetUrl = urlObj.searchParams.get('url') || url;
      // 提取文件名作为 ID
      const parts = targetUrl.split('?')[0].split('/');
      return parts[parts.length - 1];
    } catch {
      return url;
    }
  }, []);

  useEffect(() => {
    const videoId = getVideoId(src);

    // 如果 ID 没变，说明是同一个视频（即使 URL 签名变了），不需要重新加载
    if (videoId === currentVideoIdRef.current && blobUrl) {
      return;
    }

    // ID 变了，清理旧资源
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    currentVideoIdRef.current = videoId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const loadVideo = async () => {
      try {
        const cacheName = 'luna-video-cache-v2'; // 升级缓存版本
        // 使用虚拟 URL 作为 Cache Key，确保 Key 稳定且唯一
        const cacheKey = `https://luna-cache/video/${videoId}`;
        let response: Response | undefined;
        let cache: Cache | undefined;

        // 1. 尝试从 Cache API 获取
        if ('caches' in window) {
          try {
            cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
              console.log(`[BannerVideo] 🎯 Cache HIT: ${videoId}`);
              response = cachedResponse;
            }
          } catch (e) {
            console.warn('[BannerVideo] Cache access failed:', e);
          }
        }

        // 2. 缓存未命中，发起网络请求
        if (!response) {
          console.log(`[BannerVideo] 🌐 Cache MISS, fetching: ${videoId}`);
          response = await fetch(src, {
            signal: controller.signal,
            cache: 'force-cache',
          });

          if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

          // 3. 写入缓存 (克隆 response)
          if (cache && response.status === 200) {
            try {
              const responseToCache = response.clone();
              cache
                .put(cacheKey, responseToCache)
                .catch((e) =>
                  console.warn('[BannerVideo] Cache write failed:', e),
                );
            } catch (e) {
              console.warn('[BannerVideo] Cache put error:', e);
            }
          }
        }

        // 4. 转换为 Blob URL
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          const objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('[BannerVideo] Video load failed:', error);
          // 如果 Blob 加载失败，回退到原始 src 流式播放
          // 但这里我们不自动回退，而是让 onError 触发，由父组件决定是否重试或降级
          if (onError && !controller.signal.aborted) {
            // 模拟一个错误事件或直接调用 onError
            // 由于这里是异步逻辑，无法直接触发 video 的 error 事件
            // 我们可以选择设置 blobUrl 为 null，让 video 尝试加载 src（如果我们在 render 中做了回退逻辑）
            // 或者保持 blobUrl 为 null，让 render 使用原始 src
          }
        }
      }
    };

    loadVideo();

    return () => {
      controller.abort();
    };
  }, [src, getVideoId]); // 依赖 src 变化

  // 组件卸载时清理 Blob URL
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [isActive]);

  // 优先使用 Blob URL，如果没有（正在加载或失败），使用原始 src 作为回退
  // 这样即使用户网络差，也能先看到流式播放（如果 fetch 还没完成）
  // 但为了避免双重请求，通常建议等待 Blob。
  // 鉴于用户要求“完整缓存”，我们只在 blobUrl 存在时才渲染 src，或者在 fetch 失败时回退。
  // 这里简化逻辑：如果有 blobUrl 就用 blobUrl，否则用 src (流式)
  // 注意：如果正在 fetch 中，src=src 会导致浏览器同时也去发起 Range 请求，造成双重带宽浪费。
  // 所以：如果没有 blobUrl，我们暂时不给 src，或者只给 poster。
  // 等待 blob 加载完毕后再播放。
  const finalSrc = blobUrl || undefined;

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
        isActive && finalSrc ? 'opacity-100' : 'opacity-0'
      }`}
      autoPlay={isActive}
      muted={isMuted}
      loop
      playsInline
      preload='metadata'
      poster={poster}
      onError={onError}
      onLoadedData={onLoad}
      src={finalSrc}
    />
  );
};

export default function HeroBanner({
  items,
  autoPlayInterval = 8000, // Netflix风格：更长的停留时间
  showControls = true,
  showIndicators = true,
  enableVideo = false,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 存储刷新后的trailer URL（用于403自动重试，使用localStorage持久化）
  const [refreshedTrailerUrls, setRefreshedTrailerUrls] = useState<
    Record<string, string>
  >(() => {
    // 从 localStorage 加载已刷新的 URL
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('refreshed-trailer-urls');
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        console.error('[HeroBanner] 读取localStorage失败:', error);
        return {};
      }
    }
    return {};
  });

  // 记录播放失败的视频ID，避免重复渲染导致无限重试
  const [failedVideoIds, setFailedVideoIds] = useState<Set<string | number>>(
    new Set(),
  );

  // 🎯 锁定视频 URL：记录每个视频 ID 对应的第一个 URL
  // 即使后续 props 传入了新签名的 URL，也坚持使用第一次记录的 URL
  // 这样可以确保 URL 不变，让浏览器能够利用缓存，避免重复请求
  const stableVideoUrlsRef = useRef<Map<string | number, string>>(new Map());

  // 更新稳定 URL Map
  items.forEach((item) => {
    if (!item.trailerUrl) return;

    // 尝试提取视频 ID (文件名) 作为 key
    // 如果没有 douban_id，就用 item.id
    const key = item.douban_id || item.id;

    if (!stableVideoUrlsRef.current.has(key)) {
      stableVideoUrlsRef.current.set(key, item.trailerUrl);
    }
  });

  // 获取稳定的视频 URL
  const getStableVideoUrl = (item: BannerItem) => {
    const key = item.douban_id || item.id;
    // 优先使用刷新后的 URL (处理 403)
    if (item.douban_id && refreshedTrailerUrls[item.douban_id]) {
      return refreshedTrailerUrls[item.douban_id];
    }
    // 其次使用锁定的旧 URL
    if (stableVideoUrlsRef.current.has(key)) {
      return stableVideoUrlsRef.current.get(key)!;
    }
    // 最后使用当前 URL
    return item.trailerUrl;
  };

  // 记录已渲染过的图片索引，避免重复挂载导致重新请求
  const [renderedIndices, setRenderedIndices] = useState<Set<number>>(
    new Set([0, 1, items.length - 1]),
  );

  // 记录需要降级使用完整 URL 的视频 ID
  const [fallbackVideoIds, setFallbackVideoIds] = useState<
    Set<string | number>
  >(new Set());

  // 更新已渲染索引
  useEffect(() => {
    setRenderedIndices((prev) => {
      const nextIndex = (currentIndex + 1) % items.length;
      const prevIndex = (currentIndex - 1 + items.length) % items.length;

      if (
        prev.has(currentIndex) &&
        prev.has(nextIndex) &&
        prev.has(prevIndex)
      ) {
        return prev;
      }

      const newSet = new Set(prev);
      newSet.add(currentIndex);
      newSet.add(nextIndex);
      newSet.add(prevIndex);
      return newSet;
    });
  }, [currentIndex, items.length]);

  // 🎯 使用 useRef 跟踪已请求和正在请求中的 trailer ID，避免重复请求
  const requestedTrailersRef = useRef<Set<string | number>>(new Set());
  const requestingTrailersRef = useRef<Set<string | number>>(new Set());

  // 处理图片 URL，使用代理绕过防盗链
  const getProxiedImageUrl = (url: string) => {
    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 确保 backdrop 是高清版本
  const getHDBackdrop = (url?: string) => {
    if (!url) return url;
    return url
      .replace('/view/photo/s/', '/view/photo/l/')
      .replace('/view/photo/m/', '/view/photo/l/')
      .replace('/view/photo/sqxs/', '/view/photo/l/')
      .replace('/s_ratio_poster/', '/l_ratio_poster/')
      .replace('/m_ratio_poster/', '/l_ratio_poster/');
  };

  // 处理视频 URL，使用代理绕过防盗链
  const getProxiedVideoUrl = (url: string, item?: BannerItem) => {
    // 🎯 优先使用 ID 模式（利用浏览器缓存）
    // 如果有 douban_id 且没有被标记为需要降级，只传递 id 参数
    // 这样 URL 永远不变：/api/video-proxy?id=123456
    if (item?.douban_id && !fallbackVideoIds.has(item.id)) {
      return `/api/video-proxy?id=${item.douban_id}`;
    }

    if (url?.includes('douban') || url?.includes('doubanio')) {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 刷新过期的trailer URL（通过后端代理调用豆瓣移动端API，绕过缓存）
  const refreshTrailerUrl = useCallback(async (doubanId: number | string) => {
    // 🎯 防重复请求：如果正在请求中或已请求过，直接返回
    if (requestingTrailersRef.current.has(doubanId)) {
      console.log('[HeroBanner] 跳过重复请求:', doubanId);
      return null;
    }

    if (requestedTrailersRef.current.has(doubanId)) {
      console.log('[HeroBanner] 已请求过该 trailer，跳过:', doubanId);
      return null;
    }

    try {
      // 标记为正在请求中
      requestingTrailersRef.current.add(doubanId);
      console.log('[HeroBanner] 检测到trailer URL过期，重新获取:', doubanId);

      // 🎯 调用专门的刷新API（不使用缓存，直接调用豆瓣移动端API）
      const response = await fetch(
        `/api/douban/refresh-trailer?id=${doubanId}`,
      );

      if (!response.ok) {
        console.error('[HeroBanner] 刷新trailer URL失败:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.code === 200 && data.data?.trailerUrl) {
        console.log('[HeroBanner] 成功获取新的trailer URL');

        // 更新 state 并保存到 localStorage
        setRefreshedTrailerUrls((prev) => {
          const updated = {
            ...prev,
            [doubanId]: data.data.trailerUrl,
          };

          // 持久化到 localStorage
          try {
            localStorage.setItem(
              'refreshed-trailer-urls',
              JSON.stringify(updated),
            );
          } catch (error) {
            console.error('[HeroBanner] 保存到localStorage失败:', error);
          }

          return updated;
        });

        return data.data.trailerUrl;
      } else {
        console.warn('[HeroBanner] 未能获取新的trailer URL:', data.message);
      }
    } catch (error) {
      console.error('[HeroBanner] 刷新trailer URL异常:', error);
    } finally {
      // 移除正在请求中的标记
      requestingTrailersRef.current.delete(doubanId);
      // 标记为已请求（无论成功与否，本次会话不再重试，防止死循环）
      requestedTrailersRef.current.add(doubanId);
    }
    return null;
  }, []);

  // 获取当前有效的trailer URL（优先使用刷新后的）
  const getEffectiveTrailerUrl = (item: BannerItem) => {
    if (item.douban_id && refreshedTrailerUrls[item.douban_id]) {
      return refreshedTrailerUrls[item.douban_id];
    }
    return item.trailerUrl;
  };

  // 导航函数
  const handleNext = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => setIsTransitioning(false), 800); // Netflix风格：更慢的过渡
  }, [isTransitioning, items.length]);

  const handlePrev = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => setIsTransitioning(false), 800);
  }, [isTransitioning, items.length]);

  const handleIndicatorClick = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setVideoLoaded(false); // 重置视频加载状态
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // 使用自动轮播 Hook
  useAutoplay({
    currentIndex,
    isHovered,
    autoPlayInterval,
    itemsLength: items.length,
    onNext: handleNext,
  });

  // 使用滑动手势 Hook
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const backgroundImage =
    getHDBackdrop(currentItem.backdrop) || currentItem.poster;

  return (
    <div
      className='relative w-full h-[50vh] sm:h-[55vh] md:h-[60vh] overflow-hidden group'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...swipeHandlers}
    >
      {/* 背景图片/视频层 */}
      <div className='absolute inset-0'>
        {/* 只渲染当前、前一张、后一张（性能优化） */}
        {items.map((item, index) => {
          // 计算是否应该渲染此项
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          const nextIndex = (currentIndex + 1) % items.length;

          // 只要曾经渲染过，就保持渲染，避免卸载导致重新请求
          const shouldRender = renderedIndices.has(index);

          if (!shouldRender) return null;

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* 背景图片（始终显示，作为视频的占位符） */}
              <Image
                src={getProxiedImageUrl(
                  getHDBackdrop(item.backdrop) || item.poster,
                )}
                alt={item.title}
                fill
                className='object-cover object-center'
                priority={index === 0}
                quality={100}
                sizes='100vw'
                unoptimized={
                  item.backdrop?.includes('/l/') ||
                  item.backdrop?.includes('/l_ratio_poster/') ||
                  false
                }
              />

              {/* 视频背景（如果启用且有预告片URL，加载完成后淡入） */}
              {enableVideo &&
                getStableVideoUrl(item) &&
                !failedVideoIds.has(item.id) &&
                index === currentIndex && (
                  <BannerVideo
                    src={getProxiedVideoUrl(
                      getStableVideoUrl(item) || '',
                      item,
                    )}
                    poster={getProxiedImageUrl(
                      getHDBackdrop(item.backdrop) || item.poster,
                    )}
                    isActive={index === currentIndex}
                    isMuted={isMuted}
                    onLoad={(e) => {
                      setVideoLoaded(true); // 视频加载完成，淡入显示
                    }}
                    onError={async (e) => {
                      // 这里的 e 可能是原生事件，也可能是 fetch 错误
                      console.warn('[HeroBanner] 视频加载失败:', {
                        title: item.title,
                        trailerUrl: item.trailerUrl,
                        error: e,
                      });

                      // 1. 尝试降级：如果当前是 ID 模式，切换到完整 URL 模式
                      if (item.douban_id && !fallbackVideoIds.has(item.id)) {
                        console.log(
                          '[HeroBanner] ID模式加载失败，降级到完整URL模式:',
                          item.id,
                        );
                        setFallbackVideoIds((prev) =>
                          new Set(prev).add(item.id),
                        );
                        // 状态更新会触发重新渲染，从而使用新 URL
                        return;
                      }

                      // 如果已经刷新过或者是刷新后的URL失败了，标记为失败并不再重试
                      if (
                        (item.douban_id &&
                          refreshedTrailerUrls[item.douban_id]) ||
                        !item.douban_id
                      ) {
                        console.log(
                          '[HeroBanner] 视频彻底加载失败，停止重试:',
                          item.id,
                        );
                        setFailedVideoIds((prev) => new Set(prev).add(item.id));
                        return;
                      }

                      // 尝试刷新 URL
                      if (item.douban_id) {
                        console.log(
                          '[HeroBanner] 尝试刷新过期 URL:',
                          item.douban_id,
                        );
                        const newUrl = await refreshTrailerUrl(item.douban_id);
                        if (!newUrl) {
                          // 刷新失败，标记为失败
                          console.log(
                            '[HeroBanner] URL刷新失败，停止重试:',
                            item.id,
                          );
                          setFailedVideoIds((prev) =>
                            new Set(prev).add(item.id),
                          );
                        }
                      }
                    }}
                  />
                )}
            </div>
          );
        })}

        {/* Netflix经典渐变遮罩：底部黑→中间透明→顶部黑 */}
        <div className='absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80' />

        {/* 左侧额外渐变（增强文字可读性） */}
        <div className='absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent' />
      </div>

      {/* 内容叠加层 - Netflix风格：左下角 */}
      <div className='absolute bottom-0 left-0 right-0 px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 pb-12 sm:pb-16 md:pb-20 lg:pb-24'>
        <div className='space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6'>
          {/* 标题 - Netflix风格：超大字体 */}
          <h1 className='text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white drop-shadow-2xl leading-tight break-words'>
            {currentItem.title}
          </h1>

          {/* 元数据 */}
          <div className='flex items-center gap-3 sm:gap-4 text-sm sm:text-base md:text-lg flex-wrap'>
            {currentItem.rate && (
              <div className='flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/90 backdrop-blur-sm rounded'>
                <span className='text-white font-bold'>★</span>
                <span className='text-white font-bold'>{currentItem.rate}</span>
              </div>
            )}
            {currentItem.year && (
              <span className='text-white/90 font-semibold drop-shadow-md'>
                {currentItem.year}
              </span>
            )}
            {currentItem.type && (
              <span className='px-3 py-1 bg-white/20 backdrop-blur-sm rounded text-white/90 font-medium border border-white/30'>
                {currentItem.type === 'movie'
                  ? '电影'
                  : currentItem.type === 'tv'
                    ? '剧集'
                    : currentItem.type === 'variety'
                      ? '综艺'
                      : currentItem.type === 'shortdrama'
                        ? '短剧'
                        : currentItem.type === 'anime'
                          ? '动漫'
                          : '剧集'}
              </span>
            )}
          </div>

          {/* 描述 - 限制3行 */}
          {currentItem.description && (
            <p className='text-sm sm:text-base md:text-lg lg:text-xl text-white/90 line-clamp-3 drop-shadow-lg leading-relaxed max-w-xl'>
              {currentItem.description}
            </p>
          )}

          {/* 操作按钮 - Netflix风格 */}
          <div className='flex gap-3 sm:gap-4 pt-2'>
            <Link
              href={
                currentItem.type === 'shortdrama'
                  ? `/play?title=${encodeURIComponent(currentItem.title)}&shortdrama_id=${currentItem.id}`
                  : `/play?title=${encodeURIComponent(currentItem.title)}${currentItem.year ? `&year=${currentItem.year}` : ''}${currentItem.douban_id ? `&douban_id=${currentItem.douban_id}` : ''}${currentItem.type ? `&stype=${currentItem.type}` : ''}`
              }
              className='flex items-center gap-2 px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 bg-white text-black font-bold rounded hover:bg-white/90 transition-all transform hover:scale-105 active:scale-95 shadow-xl text-base sm:text-lg md:text-xl'
            >
              <Play
                className='w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7'
                fill='currentColor'
              />
              <span>播放</span>
            </Link>
            <Link
              href={
                currentItem.type === 'shortdrama'
                  ? '/shortdrama'
                  : `/douban?type=${
                      currentItem.type === 'variety'
                        ? 'show'
                        : currentItem.type || 'movie'
                    }`
              }
              className='flex items-center gap-2 px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-4 bg-white/30 backdrop-blur-md text-white font-bold rounded hover:bg-white/40 transition-all transform hover:scale-105 active:scale-95 shadow-xl text-base sm:text-lg md:text-xl border border-white/50'
            >
              <Info className='w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7' />
              <span>更多信息</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 音量控制按钮（仅视频模式） - 底部右下角，避免遮挡简介 */}
      {enableVideo && getStableVideoUrl(currentItem) && (
        <button
          onClick={toggleMute}
          className='absolute bottom-6 sm:bottom-8 right-4 sm:right-8 md:right-12 lg:right-16 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-all border border-white/50 z-10'
          aria-label={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? (
            <VolumeX className='w-5 h-5 sm:w-6 sm:h-6' />
          ) : (
            <Volume2 className='w-5 h-5 sm:w-6 sm:h-6' />
          )}
        </button>
      )}

      {/* 导航按钮 - 桌面端显示 */}
      {showControls && items.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className='hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-black/50 backdrop-blur-sm text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all transform hover:scale-110 border border-white/30'
            aria-label='上一张'
          >
            <ChevronLeft className='w-7 h-7 lg:w-8 lg:h-8' />
          </button>
          <button
            onClick={handleNext}
            className='hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-black/50 backdrop-blur-sm text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all transform hover:scale-110 border border-white/30'
            aria-label='下一张'
          >
            <ChevronRight className='w-7 h-7 lg:w-8 lg:h-8' />
          </button>
        </>
      )}

      {/* 指示器 - Netflix风格：底部居中 */}
      {showIndicators && items.length > 1 && (
        <div className='absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2'>
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => handleIndicatorClick(index)}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 sm:w-10 bg-white shadow-lg'
                  : 'w-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`跳转到第 ${index + 1} 张`}
            />
          ))}
        </div>
      )}

      {/* 年龄分级标识（可选） */}
      <div className='absolute top-4 sm:top-6 md:top-8 right-4 sm:right-8 md:right-12'>
        <div className='px-2 py-1 bg-black/60 backdrop-blur-sm border-2 border-white/70 rounded text-white text-xs sm:text-sm font-bold'>
          {currentIndex + 1} / {items.length}
        </div>
      </div>
    </div>
  );
}
