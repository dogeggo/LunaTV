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

import {
  getHeroImageCacheKey,
  getHeroVideoCacheKey,
  HERO_CAROUSEL_MANIFEST_KEY,
  HERO_IMAGE_CACHE,
  HERO_VIDEO_CACHE,
} from '@/lib/cache';
import { processImageUrl } from '@/lib/utils';

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
  trailerUrl?: string;
}

interface HeroBannerProps {
  items: BannerItem[];
  autoPlayInterval?: number;
  showControls?: boolean;
  showIndicators?: boolean;
  enableVideo?: boolean;
}

const RETRY_INTERVAL_MS = 10 * 60 * 1000;

const toItemKey = (item: BannerItem) => String(item.douban_id ?? item.id);

const isAbortError = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error && typeof error === 'object' && 'name' in error) {
    return (error as { name?: string }).name === 'AbortError';
  }
  return false;
};

const getHDBackdrop = (url?: string) => {
  if (!url) return url;
  return url
    .replace('/view/photo/s/', '/view/photo/l/')
    .replace('/view/photo/m/', '/view/photo/l/')
    .replace('/view/photo/sqxs/', '/view/photo/l/')
    .replace('/s_ratio_poster/', '/l_ratio_poster/')
    .replace('/m_ratio_poster/', '/l_ratio_poster/');
};

const getImageUrl = (item: BannerItem) => {
  const rawUrl = getHDBackdrop(item.backdrop || item.poster);
  if (!rawUrl) return null;
  return processImageUrl(rawUrl);
};

const getVideoFetchUrl = (doubanId: string | number) =>
  `/api/video-proxy?id=${doubanId}&carousel=1`;

const useCachedBlobUrl = (
  cacheName: string,
  cacheKey: string | null,
  enabled = true,
) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !cacheKey) {
      setBlobUrl(null);
      return;
    }

    if (typeof window === 'undefined' || !('caches' in window)) {
      setBlobUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const loadFromCache = async () => {
      try {
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(cacheKey);
        if (!cachedResponse) {
          if (!cancelled) setBlobUrl(null);
          return;
        }

        const blob = await cachedResponse.blob();
        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        objectUrl = nextUrl;
        setBlobUrl(nextUrl);
      } catch (error) {
        if (!cancelled) setBlobUrl(null);
        console.warn('[HeroBanner] Cache read failed:', error);
      }
    };

    loadFromCache();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cacheName, cacheKey, enabled]);

  return blobUrl;
};

const BannerImage = ({
  cacheKey,
  alt,
  isPriority,
}: {
  cacheKey: string | null;
  alt: string;
  isPriority: boolean;
}) => {
  const blobUrl = useCachedBlobUrl(HERO_IMAGE_CACHE, cacheKey, true);

  if (!blobUrl) {
    return (
      <div className='absolute inset-0 bg-black/10 animate-pulse pointer-events-none' />
    );
  }

  return (
    <div className='absolute inset-0 pointer-events-none'>
      <Image
        src={blobUrl}
        alt={alt}
        fill
        className='object-cover object-center'
        priority={isPriority}
        quality={85}
        sizes='100vw'
        unoptimized={true}
      />
    </div>
  );
};

const BannerVideo = ({
  cacheKey,
  isActive,
  isMuted,
  onLoad,
  onError,
}: {
  cacheKey: string | null;
  isActive: boolean;
  isMuted: boolean;
  onLoad?: (e: any) => void;
  onError?: (e: any) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const blobUrl = useCachedBlobUrl(HERO_VIDEO_CACHE, cacheKey, true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive && blobUrl) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [isActive, blobUrl]);

  if (!blobUrl) {
    return null;
  }

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 pointer-events-none ${
        isActive ? 'opacity-100' : 'opacity-0'
      }`}
      autoPlay={isActive}
      muted={isMuted}
      loop
      playsInline
      preload='metadata'
      onError={onError}
      onLoadedData={onLoad}
      src={blobUrl}
    />
  );
};

export default function HeroBanner({
  items,
  autoPlayInterval = 8000,
  showControls = true,
  showIndicators = true,
  enableVideo = false,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const itemsRef = useRef(items);
  const failedImageKeysRef = useRef<Set<string>>(new Set());
  const failedVideoKeysRef = useRef<Set<string>>(new Set());
  const downloadingImageKeysRef = useRef<Set<string>>(new Set());
  const downloadingVideoKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const imageKeys = new Set<string>();
    const videoKeys = new Set<string>();

    items.forEach((item) => {
      const imageUrl = getImageUrl(item);
      if (imageUrl) {
        imageKeys.add(getHeroImageCacheKey(imageUrl));
      }

      if (enableVideo && item.douban_id) {
        videoKeys.add(getHeroVideoCacheKey(item.douban_id));
      }
    });

    const manifest = {
      images: Array.from(imageKeys),
      videos: Array.from(videoKeys),
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(
        HERO_CAROUSEL_MANIFEST_KEY,
        JSON.stringify(manifest),
      );
    } catch (error) {
      console.warn('[HeroBanner] 轮播缓存清单写入失败:', error);
    }

    const win = window as typeof window & {
      __heroCarouselCacheManifest?: typeof manifest;
    };
    win.__heroCarouselCacheManifest = manifest;
  }, [items, enableVideo]);

  useEffect(() => {
    if (currentIndex >= items.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, items.length]);

  const cacheAsset = useCallback(
    async (
      cacheName: string,
      cacheKey: string,
      url: string,
      signal?: AbortSignal,
    ) => {
      if (typeof window === 'undefined' || !('caches' in window)) return false;

      try {
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) return true;

        const response = await fetch(url, {
          cache: 'no-store',
          signal,
        });

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        await cache.put(cacheKey, response.clone());
        return true;
      } catch (error) {
        if (isAbortError(error, signal)) return false;
        throw error;
      }
    },
    [],
  );

  const downloadImage = useCallback(
    async (item: BannerItem, signal?: AbortSignal) => {
      const imageUrl = getImageUrl(item);
      if (!imageUrl) return;

      const key = toItemKey(item);
      if (downloadingImageKeysRef.current.has(key)) return;

      downloadingImageKeysRef.current.add(key);
      try {
        const cacheKey = getHeroImageCacheKey(imageUrl);
        const ok = await cacheAsset(
          HERO_IMAGE_CACHE,
          cacheKey,
          imageUrl,
          signal,
        );
        if (ok) {
          failedImageKeysRef.current.delete(key);
        }
      } catch (error) {
        failedImageKeysRef.current.add(key);
        console.warn('[HeroBanner] 图片下载失败:', error);
      } finally {
        downloadingImageKeysRef.current.delete(key);
      }
    },
    [cacheAsset],
  );

  const downloadVideo = useCallback(
    async (item: BannerItem, signal?: AbortSignal) => {
      if (!enableVideo) return;
      if (!item.douban_id) return;

      const key = toItemKey(item);
      if (failedVideoKeysRef.current.has(key)) return;
      if (downloadingVideoKeysRef.current.has(key)) return;

      downloadingVideoKeysRef.current.add(key);
      try {
        const cacheKey = getHeroVideoCacheKey(item.douban_id);
        const fetchUrl = getVideoFetchUrl(item.douban_id);
        const ok = await cacheAsset(
          HERO_VIDEO_CACHE,
          cacheKey,
          fetchUrl,
          signal,
        );
        if (ok) {
          failedVideoKeysRef.current.delete(key);
        }
      } catch (error) {
        failedVideoKeysRef.current.add(key);
        console.warn('[HeroBanner] 视频下载失败:', error);
      } finally {
        downloadingVideoKeysRef.current.delete(key);
      }
    },
    [cacheAsset, enableVideo],
  );

  const retryFailed = useCallback(() => {
    const currentItems = itemsRef.current;
    if (!currentItems.length) return;

    currentItems.forEach((item) => {
      const key = toItemKey(item);

      if (failedImageKeysRef.current.has(key)) {
        void downloadImage(item);
      }

      if (enableVideo && failedVideoKeysRef.current.has(key)) {
        failedVideoKeysRef.current.delete(key);
        void downloadVideo(item);
      }
    });
  }, [downloadImage, downloadVideo, enableVideo]);

  useEffect(() => {
    if (!items.length) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    const warmupCache = async () => {
      for (const item of items) {
        if (signal.aborted) return;
        await downloadImage(item, signal);
        if (enableVideo) {
          await downloadVideo(item, signal);
        }
      }
    };

    void warmupCache();

    return () => {
      abortController.abort();
    };
  }, [items, enableVideo, downloadImage, downloadVideo]);

  useEffect(() => {
    if (!items.length) return;

    const currentItem = items[currentIndex];
    if (!currentItem) return;

    void downloadImage(currentItem);
    if (enableVideo) {
      void downloadVideo(currentItem);
    }
  }, [currentIndex, items, enableVideo, downloadImage, downloadVideo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timerId = window.setInterval(() => {
      retryFailed();
    }, RETRY_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [retryFailed]);

  const [renderedIndices, setRenderedIndices] = useState<Set<number>>(() => {
    if (!items.length) return new Set();
    const lastIndex = (items.length - 1 + items.length) % items.length;
    return new Set([0, 1 % items.length, lastIndex]);
  });

  useEffect(() => {
    if (!items.length) {
      setRenderedIndices(new Set());
      return;
    }

    const lastIndex = (items.length - 1 + items.length) % items.length;
    setRenderedIndices(new Set([0, 1 % items.length, lastIndex]));
  }, [items.length]);

  useEffect(() => {
    if (!items.length) return;

    setRenderedIndices((prev) => {
      const nextIndex = (currentIndex + 1) % items.length;
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      const next = new Set(prev);
      next.add(currentIndex);
      next.add(nextIndex);
      next.add(prevIndex);
      return next;
    });
  }, [currentIndex, items.length]);

  const handleNext = useCallback(() => {
    if (isTransitioning || items.length === 0) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => setIsTransitioning(false), 800);
  }, [isTransitioning, items.length]);

  const handlePrev = useCallback(() => {
    if (isTransitioning || items.length === 0) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => setIsTransitioning(false), 800);
  }, [isTransitioning, items.length]);

  const handleIndicatorClick = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  useAutoplay({
    currentIndex,
    isHovered,
    autoPlayInterval,
    itemsLength: items.length,
    onNext: handleNext,
  });

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const hasVideo = enableVideo && !!currentItem.douban_id;

  return (
    <div
      className='relative w-full h-[50vh] sm:h-[55vh] md:h-[60vh] overflow-hidden group'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...swipeHandlers}
    >
      <div className='absolute inset-0 pointer-events-none'>
        {items.map((item, index) => {
          const shouldRender = renderedIndices.has(index);
          if (!shouldRender) return null;

          const imageUrl = getImageUrl(item);
          const imageCacheKey = imageUrl
            ? getHeroImageCacheKey(imageUrl)
            : null;
          const videoCacheKey =
            enableVideo && item.douban_id
              ? getHeroVideoCacheKey(item.douban_id)
              : null;

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <BannerImage
                cacheKey={imageCacheKey}
                alt={item.title}
                isPriority={index === 0}
              />

              {enableVideo && index === currentIndex && (
                <BannerVideo
                  cacheKey={videoCacheKey}
                  isActive={index === currentIndex}
                  isMuted={isMuted}
                  onError={() => {
                    failedVideoKeysRef.current.add(toItemKey(item));
                  }}
                />
              )}
            </div>
          );
        })}

        <div className='absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/80' />
        <div className='absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent' />
      </div>

      <div className='absolute bottom-0 left-0 right-0 px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 pb-12 sm:pb-16 md:pb-20 lg:pb-24'>
        <div className='space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6'>
          <h1 className='text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white drop-shadow-2xl leading-tight break-words'>
            {currentItem.title}
          </h1>

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

          {currentItem.description && (
            <p className='text-sm sm:text-base md:text-lg lg:text-xl text-white/90 line-clamp-3 drop-shadow-lg leading-relaxed max-w-xl'>
              {currentItem.description}
            </p>
          )}

          <div className='flex gap-3 sm:gap-4 pt-2'>
            <Link
              href={
                currentItem.type === 'shortdrama'
                  ? `/play?title=${encodeURIComponent(currentItem.title)}`
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

      {hasVideo && (
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

      <div className='absolute top-4 sm:top-6 md:top-8 right-4 sm:right-8 md:right-12'>
        <div className='px-2 py-1 bg-black/60 backdrop-blur-sm border-2 border-white/70 rounded text-white text-xs sm:text-sm font-bold'>
          {currentIndex + 1} / {items.length}
        </div>
      </div>
    </div>
  );
}
