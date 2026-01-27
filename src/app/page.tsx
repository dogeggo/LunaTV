/* eslint-disable no-console */

'use client';

import {
  Calendar,
  ChevronRight,
  Film,
  Play,
  Sparkles,
  Trash2,
  Tv,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  startTransition,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BangumiCalendarData, GetBangumiCalendarData } from '@/lib/bangumi-api';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories } from '@/lib/douban-api';
import { getRecommendedShortDramas } from '@/lib/shortdrama-api';
import { ReleaseCalendarItem, ShortDramaItem } from '@/lib/types';
import { DoubanMovieDetail } from '@/lib/types';

// 🚀 性能优化:首屏必需组件使用静态导入,减少CSS预加载警告
import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import { useSite } from '@/components/SiteProvider';
import SkeletonCard from '@/components/SkeletonCard';

// 🚀 性能优化：使用动态导入延迟加载重型组件，显著提升导航响应速度
const ConfirmDialog = dynamic(
  () =>
    import(/* webpackPreload: false */ '@/components/ConfirmDialog').then(
      (mod) => mod.ConfirmDialog,
    ),
  { ssr: false },
);
const ArtPlayerPreloader = dynamic(
  () => import(/* webpackPreload: false */ '@/components/ArtPlayerPreloader'),
  { ssr: false },
);
const ContinueWatching = dynamic(
  () => import(/* webpackPreload: false */ '@/components/ContinueWatching'),
  { ssr: false },
);
const HeroBanner = dynamic(
  () => import(/* webpackPreload: false */ '@/components/HeroBanner'),
  {
    ssr: false,
  },
);
const VideoCard = dynamic(
  () => import(/* webpackPreload: false */ '@/components/VideoCard'),
  {
    ssr: false,
  },
);
const ShortDramaCard = dynamic(
  () => import(/* webpackPreload: false */ '@/components/ShortDramaCard'),
  {
    ssr: false,
  },
);
// const TelegramWelcomeModal = dynamic(
//   () =>
//     import('@/components/TelegramWelcomeModal').then(
//       (mod) => mod.TelegramWelcomeModal,
//     ),
//   { ssr: false },
// );

function HomeClient() {
  // Refs for cleanup
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const idleCallbacksRef = useRef<number[]>([]);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cleanup all pending timers and callbacks
      timeoutsRef.current.forEach(clearTimeout);
      idleCallbacksRef.current.forEach((id) => {
        if ('cancelIdleCallback' in window) {
          (window as any).cancelIdleCallback(id);
        }
      });
      timeoutsRef.current = [];
      idleCallbacksRef.current = [];
    };
  }, []);

  const runTransition = (task: () => void) => {
    if (!isMountedRef.current) return;
    startTransition(() => {
      if (!isMountedRef.current) return;
      task();
    });
  };

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanMovieDetail[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanMovieDetail[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanMovieDetail[]>(
    [],
  );
  const [hotAnime, setHotAnime] = useState<DoubanMovieDetail[]>([]);
  const [hotShortDramas, setHotShortDramas] = useState<ShortDramaItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [upcomingReleases, setUpcomingReleases] = useState<
    ReleaseCalendarItem[]
  >([]);
  const [loadingHotMovies, setLoadingHotMovies] = useState(true);
  const [loadingHotTvShows, setLoadingHotTvShows] = useState(true);
  const [loadingVarietyShows, setLoadingVarietyShows] = useState(true);
  const [loadingShortDramas, setLoadingShortDramas] = useState(true);
  const [loadingBangumi, setLoadingBangumi] = useState(true);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 合并初始化逻辑 - 优化性能，减少重渲染
  useEffect(() => {
    // 读取清空确认设置
    if (typeof window !== 'undefined') {
      const savedRequireClearConfirmation = localStorage.getItem(
        'requireClearConfirmation',
      );
      if (savedRequireClearConfirmation !== null) {
        setRequireClearConfirmation(JSON.parse(savedRequireClearConfirmation));
      }
    }

    // 检查公告弹窗状态
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 收藏夹数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    origin?: 'vod' | 'live';
    type?: string;
    releaseDate?: string;
    remarks?: string;
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [favoriteFilter, setFavoriteFilter] = useState<
    'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'
  >('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<
    'recent' | 'title' | 'rating'
  >('recent');
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'movie' | 'tv'>(
    'all',
  );
  const [showClearFavoritesDialog, setShowClearFavoritesDialog] =
    useState(false);
  const [requireClearConfirmation, setRequireClearConfirmation] =
    useState(false);

  useEffect(() => {
    const scheduleTimeout = (task: () => void, delay: number) => {
      const id = setTimeout(task, delay);
      timeoutsRef.current.push(id);
      return id;
    };

    const withTimeout = async <T,>(
      promise: Promise<T>,
      label: string,
      timeoutMs = 10000,
    ): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = scheduleTimeout(() => {
          reject(new Error(`${label} timeout`));
        }, timeoutMs);
      });

      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    const fetchAll = async () => {
      try {
        const moviesPromise = withTimeout(
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          'hot-movies',
        )
          .then((data) => {
            if (data?.code === 200) {
              runTransition(() => {
                setHotMovies(data.list);
              });
            } else {
              console.warn('Failed to load hot movies:', data);
              runTransition(() => {
                setHotMovies([]);
              });
            }
          })
          .catch((error) => {
            console.warn('Failed to load hot movies:', error);
            runTransition(() => {
              setHotMovies([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingHotMovies(false);
            });
          });

        const tvPromise = withTimeout(
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          'hot-tv',
        )
          .then((data) => {
            if (data?.code === 200) {
              runTransition(() => {
                setHotTvShows(data.list);
              });
            } else {
              console.warn('Failed to load hot tv shows:', data);
              runTransition(() => {
                setHotTvShows([]);
              });
            }
          })
          .catch((error) => {
            console.warn('Failed to load hot tv shows:', error);
            runTransition(() => {
              setHotTvShows([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingHotTvShows(false);
            });
          });

        const varietyPromise = withTimeout(
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
          'hot-variety',
        )
          .then((data) => {
            if (data?.code === 200) {
              runTransition(() => {
                setHotVarietyShows(data.list);
              });
            } else {
              console.warn('Failed to load hot variety shows:', data);
              runTransition(() => {
                setHotVarietyShows([]);
              });
            }
          })
          .catch((error) => {
            console.warn('Failed to load hot variety shows:', error);
            runTransition(() => {
              setHotVarietyShows([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingVarietyShows(false);
            });
          });

        const animePromise = withTimeout(
          getDoubanCategories({
            kind: 'tv',
            category: 'tv',
            type: 'tv_animation',
          }),
          'hot-anime',
        )
          .then((data) => {
            if (data?.code === 200) {
              runTransition(() => {
                setHotAnime(data.list);
              });
            } else {
              console.warn('Failed to load hot anime:', data);
              runTransition(() => {
                setHotAnime([]);
              });
            }
          })
          .catch((error) => {
            console.warn('Failed to load hot anime:', error);
            runTransition(() => {
              setHotAnime([]);
            });
          });

        const shortDramaPromise = withTimeout(
          getRecommendedShortDramas(undefined, 8),
          'hot-shortdrama',
        )
          .then((data) => {
            runTransition(() => {
              setHotShortDramas(Array.isArray(data) ? data : []);
            });
          })
          .catch((error) => {
            console.warn('Failed to load hot short dramas:', error);
            runTransition(() => {
              setHotShortDramas([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingShortDramas(false);
            });
          });

        const bangumiPromise = withTimeout(
          GetBangumiCalendarData(),
          'bangumi-calendar',
        )
          .then((data) => {
            if (Array.isArray(data)) {
              runTransition(() => {
                setBangumiCalendarData(data);
              });
            } else {
              console.warn('Bangumi response format invalid:', data);
              runTransition(() => {
                setBangumiCalendarData([]);
              });
            }
          })
          .catch((error) => {
            console.warn('Failed to load bangumi calendar:', error);
            runTransition(() => {
              setBangumiCalendarData([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingBangumi(false);
            });
          });

        const upcomingPromise = withTimeout(
          fetch('/api/release-calendar?limit=100').then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
          }),
          'release-calendar',
        )
          .then((data) => {
            const releases = Array.isArray(data?.items) ? data.items : [];
            runTransition(() => {
              setUpcomingReleases(releases);
            });
          })
          .catch((error) => {
            console.warn('Failed to load upcoming releases:', error);
            runTransition(() => {
              setUpcomingReleases([]);
            });
          })
          .finally(() => {
            runTransition(() => {
              setLoadingUpcoming(false);
            });
          });

        await Promise.allSettled([
          moviesPromise,
          tvPromise,
          varietyPromise,
          animePromise,
          shortDramaPromise,
          bangumiPromise,
          upcomingPromise,
        ]);
      } catch (error) {
        console.error('Failed to load secondary recommendations:', error);
        runTransition(() => {
          setLoadingHotMovies(false);
          setLoadingHotTvShows(false);
          setLoadingVarietyShows(false);
          setLoadingShortDramas(false);
          setLoadingBangumi(false);
          setLoadingUpcoming(false);
        });
      }
    };
    fetchAll();
  }, []);

  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
          origin: fav?.origin,
          type: fav?.type,
          releaseDate: fav?.releaseDate,
          remarks: fav?.remarks,
        } as FavoriteItem;
      });
    runTransition(() => {
      setFavoriteItems(sorted);
    });
  };

  // 处理清空所有收藏
  const handleClearFavorites = async () => {
    await clearAllFavorites();
    runTransition(() => {
      setFavoriteItems([]);
    });
  };

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      },
    );

    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  // 🚀 性能优化: 使用 useMemo 缓存即将上映数据的处理结果
  const processedUpcomingReleases = useMemo(() => {
    if (upcomingReleases.length === 0) return [];

    // 过滤出即将上映和刚上映的作品（过去7天到未来90天）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const ninetyDaysLater = new Date(today);
    ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

    const upcoming = upcomingReleases.filter((item: ReleaseCalendarItem) => {
      const releaseDateStr = item.releaseDate;
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];
      const isUpcoming =
        releaseDateStr >= sevenDaysAgoStr && releaseDateStr <= ninetyDaysStr;
      return isUpcoming;
    });

    // 智能去重：识别同系列内容
    const normalizeTitle = (title: string): string => {
      let normalized = title.replace(/：/g, ':').trim();
      if (normalized.includes(':')) {
        const parts = normalized.split(':').map((p) => p.trim());
        normalized = parts[parts.length - 1];
      }
      normalized = normalized
        .replace(/第[一二三四五六七八九十\d]+季/g, '')
        .replace(/[第]?[一二三四五六七八九十\d]+季/g, '')
        .replace(/Season\s*\d+/gi, '')
        .replace(/S\d+/gi, '')
        .replace(/\s+\d+$/g, '')
        .replace(/\s+/g, '')
        .trim();
      return normalized;
    };

    const uniqueUpcoming = upcoming.reduce(
      (acc: ReleaseCalendarItem[], current: ReleaseCalendarItem) => {
        const normalizedCurrent = normalizeTitle(current.title);
        const exactMatch = acc.find((item) => item.title === current.title);
        if (exactMatch) {
          const existingIndex = acc.findIndex(
            (item) => item.title === current.title,
          );
          if (
            new Date(current.releaseDate) < new Date(exactMatch.releaseDate)
          ) {
            acc[existingIndex] = current;
          }
          return acc;
        }

        const similarMatch = acc.find((item) => {
          const normalizedExisting = normalizeTitle(item.title);
          return normalizedCurrent === normalizedExisting;
        });

        if (similarMatch) {
          const existingIndex = acc.findIndex(
            (item) => normalizeTitle(item.title) === normalizedCurrent,
          );
          const currentHasSeason =
            /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(
              current.title,
            );
          const existingHasSeason =
            /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(
              similarMatch.title,
            );

          if (!currentHasSeason && existingHasSeason) {
            acc[existingIndex] = current;
          } else if (currentHasSeason === existingHasSeason) {
            if (
              new Date(current.releaseDate) < new Date(similarMatch.releaseDate)
            ) {
              acc[existingIndex] = current;
            }
          }
          return acc;
        }

        acc.push(current);
        return acc;
      },
      [],
    );

    // 智能分配：总共10个，按时间段分散选取
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysLaterStr = new Date(
      today.getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split('T')[0];
    const thirtyDaysLaterStr = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split('T')[0];

    const recentlyReleased = uniqueUpcoming.filter(
      (i: ReleaseCalendarItem) => i.releaseDate < todayStr,
    );
    const releasingToday = uniqueUpcoming.filter(
      (i: ReleaseCalendarItem) => i.releaseDate === todayStr,
    );
    const nextSevenDays = uniqueUpcoming.filter(
      (i: ReleaseCalendarItem) =>
        i.releaseDate > todayStr && i.releaseDate <= sevenDaysLaterStr,
    );
    const nextThirtyDays = uniqueUpcoming.filter(
      (i: ReleaseCalendarItem) =>
        i.releaseDate > sevenDaysLaterStr &&
        i.releaseDate <= thirtyDaysLaterStr,
    );
    const laterReleasing = uniqueUpcoming.filter(
      (i: ReleaseCalendarItem) => i.releaseDate > thirtyDaysLaterStr,
    );

    const maxTotal = 10;
    const maxTodayLimit = 3;
    const recentQuota = Math.min(2, recentlyReleased.length);
    const todayQuota = Math.min(1, releasingToday.length);
    const sevenDayQuota = Math.min(4, nextSevenDays.length);
    const thirtyDayQuota = Math.min(2, nextThirtyDays.length);
    const laterQuota = Math.min(1, laterReleasing.length);

    let selectedItems: ReleaseCalendarItem[] = [
      ...recentlyReleased.slice(0, recentQuota),
      ...releasingToday.slice(0, todayQuota),
      ...nextSevenDays.slice(0, sevenDayQuota),
      ...nextThirtyDays.slice(0, thirtyDayQuota),
      ...laterReleasing.slice(0, laterQuota),
    ];

    if (selectedItems.length < maxTotal) {
      const remaining = maxTotal - selectedItems.length;
      const additionalSeven = nextSevenDays.slice(
        sevenDayQuota,
        sevenDayQuota + remaining,
      );
      selectedItems = [...selectedItems, ...additionalSeven];

      if (selectedItems.length < maxTotal) {
        const stillRemaining = maxTotal - selectedItems.length;
        const additionalThirty = nextThirtyDays.slice(
          thirtyDayQuota,
          thirtyDayQuota + stillRemaining,
        );
        selectedItems = [...selectedItems, ...additionalThirty];
      }

      if (selectedItems.length < maxTotal) {
        const stillRemaining = maxTotal - selectedItems.length;
        const additionalLater = laterReleasing.slice(
          laterQuota,
          laterQuota + stillRemaining,
        );
        selectedItems = [...selectedItems, ...additionalLater];
      }

      if (selectedItems.length < maxTotal) {
        const stillRemaining = maxTotal - selectedItems.length;
        const additionalRecent = recentlyReleased.slice(
          recentQuota,
          recentQuota + stillRemaining,
        );
        selectedItems = [...selectedItems, ...additionalRecent];
      }

      if (selectedItems.length < maxTotal) {
        const currentTodayCount = selectedItems.filter(
          (i: ReleaseCalendarItem) => i.releaseDate === todayStr,
        ).length;
        const todayRemaining = maxTodayLimit - currentTodayCount;
        if (todayRemaining > 0) {
          const stillRemaining = Math.min(
            maxTotal - selectedItems.length,
            todayRemaining,
          );
          const additionalToday = releasingToday.slice(
            todayQuota,
            todayQuota + stillRemaining,
          );
          selectedItems = [...selectedItems, ...additionalToday];
        }
      }
    }

    return selectedItems;
  }, [upcomingReleases]);

  const hasHeroItems =
    hotMovies.length > 0 ||
    hotTvShows.length > 0 ||
    hotVarietyShows.length > 0 ||
    hotShortDramas.length > 0 ||
    hotAnime.length > 0;

  // 🚀 性能优化: 使用 useMemo 缓存收藏夹统计信息
  const favoriteStats = useMemo(() => {
    if (favoriteItems.length === 0) {
      return {
        total: 0,
        movie: 0,
        tv: 0,
        anime: 0,
        shortdrama: 0,
        live: 0,
        variety: 0,
      };
    }

    return {
      total: favoriteItems.length,
      movie: favoriteItems.filter((item) => {
        if (item.type) return item.type === 'movie';
        if (item.source === 'shortdrama' || item.source_name === '短剧')
          return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes === 1;
      }).length,
      tv: favoriteItems.filter((item) => {
        if (item.type) return item.type === 'tv';
        if (item.source === 'shortdrama' || item.source_name === '短剧')
          return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes > 1;
      }).length,
      anime: favoriteItems.filter((item) => {
        if (item.type) return item.type === 'anime';
        return item.source === 'bangumi';
      }).length,
      shortdrama: favoriteItems.filter((item) => {
        if (item.type) return item.type === 'shortdrama';
        return item.source === 'shortdrama' || item.source_name === '短剧';
      }).length,
      live: favoriteItems.filter((item) => item.origin === 'live').length,
      variety: favoriteItems.filter((item) => {
        if (item.type) return item.type === 'variety';
        return false;
      }).length,
    };
  }, [favoriteItems]);

  // 🚀 性能优化: 使用 useMemo 缓存筛选和排序后的收藏列表
  const filteredAndSortedFavorites = useMemo(() => {
    let filtered = favoriteItems;

    // 筛选
    if (favoriteFilter === 'movie') {
      filtered = favoriteItems.filter((item) => {
        if (item.type) return item.type === 'movie';
        if (item.source === 'shortdrama' || item.source_name === '短剧')
          return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes === 1;
      });
    } else if (favoriteFilter === 'tv') {
      filtered = favoriteItems.filter((item) => {
        if (item.type) return item.type === 'tv';
        if (item.source === 'shortdrama' || item.source_name === '短剧')
          return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes > 1;
      });
    } else if (favoriteFilter === 'anime') {
      filtered = favoriteItems.filter((item) => {
        if (item.type) return item.type === 'anime';
        return item.source === 'bangumi';
      });
    } else if (favoriteFilter === 'shortdrama') {
      filtered = favoriteItems.filter((item) => {
        if (item.type) return item.type === 'shortdrama';
        return item.source === 'shortdrama' || item.source_name === '短剧';
      });
    } else if (favoriteFilter === 'live') {
      filtered = favoriteItems.filter((item) => item.origin === 'live');
    } else if (favoriteFilter === 'variety') {
      filtered = favoriteItems.filter((item) => {
        if (item.type) return item.type === 'variety';
        return false;
      });
    }

    // 排序
    if (favoriteSortBy === 'title') {
      filtered = [...filtered].sort((a, b) =>
        a.title.localeCompare(b.title, 'zh-CN'),
      );
    }

    return filtered;
  }, [favoriteItems, favoriteFilter, favoriteSortBy]);

  if (!isMounted) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-[50vh]'>
          <div className='flex flex-col items-center gap-4'>
            <div className='w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin' />
            <p className='text-gray-500 dark:text-gray-400 animate-pulse'>
              正在进入首页...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* 预加载播放器模块 */}
      <ArtPlayerPreloader />
      {/* Telegram 新用户欢迎弹窗 */}
      {/* <TelegramWelcomeModal /> */}

      <div className='overflow-visible -mt-6 md:mt-0'>
        {/* 顶部 Tab 切换 - AI 按钮已移至右上角导航栏 */}
        <div className='mb-8 flex items-center justify-center'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>

        <div className='w-full mx-auto'>
          {activeTab === 'favorites' ? (
            // 收藏夹视图
            <section className='mb-8'>
              <div className='mb-6 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 dark:text-red-400 dark:hover:text-white dark:hover:bg-red-500 border border-red-300 dark:border-red-700 hover:border-red-600 dark:hover:border-red-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md'
                    onClick={() => {
                      // 根据用户设置决定是否显示确认对话框
                      if (requireClearConfirmation) {
                        setShowClearFavoritesDialog(true);
                      } else {
                        handleClearFavorites();
                      }
                    }}
                  >
                    <Trash2 className='w-4 h-4' />
                    <span>清空收藏</span>
                  </button>
                )}
              </div>

              {/* 统计信息 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400'>
                  <span className='px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full'>
                    共{' '}
                    <strong className='text-gray-900 dark:text-gray-100'>
                      {favoriteStats.total}
                    </strong>{' '}
                    项
                  </span>
                  {favoriteStats.movie > 0 && (
                    <span className='px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full'>
                      电影 {favoriteStats.movie}
                    </span>
                  )}
                  {favoriteStats.tv > 0 && (
                    <span className='px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full'>
                      剧集 {favoriteStats.tv}
                    </span>
                  )}
                  {favoriteStats.anime > 0 && (
                    <span className='px-3 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-full'>
                      动漫 {favoriteStats.anime}
                    </span>
                  )}
                  {favoriteStats.shortdrama > 0 && (
                    <span className='px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-full'>
                      短剧 {favoriteStats.shortdrama}
                    </span>
                  )}
                  {favoriteStats.live > 0 && (
                    <span className='px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-full'>
                      直播 {favoriteStats.live}
                    </span>
                  )}
                  {favoriteStats.variety > 0 && (
                    <span className='px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full'>
                      综艺 {favoriteStats.variety}
                    </span>
                  )}
                </div>
              )}

              {/* 筛选标签 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex flex-wrap gap-2'>
                  {[
                    { key: 'all' as const, label: '全部', icon: '📚' },
                    { key: 'movie' as const, label: '电影', icon: '🎬' },
                    { key: 'tv' as const, label: '剧集', icon: '📺' },
                    { key: 'anime' as const, label: '动漫', icon: '🎌' },
                    { key: 'shortdrama' as const, label: '短剧', icon: '🎭' },
                    { key: 'live' as const, label: '直播', icon: '📡' },
                    { key: 'variety' as const, label: '综艺', icon: '🎪' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setFavoriteFilter(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        favoriteFilter === key
                          ? 'bg-linear-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className='mr-1'>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 排序选项 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex items-center gap-2 text-sm'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    排序：
                  </span>
                  <div className='flex gap-2'>
                    {[
                      { key: 'recent' as const, label: '最近添加' },
                      { key: 'title' as const, label: '标题 A-Z' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setFavoriteSortBy(key)}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          favoriteSortBy === key
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-x-8'>
                {filteredAndSortedFavorites.map((item) => {
                  // 智能计算即将上映状态
                  let calculatedRemarks = item.remarks;

                  if (item.releaseDate) {
                    const now = new Date();
                    now.setHours(0, 0, 0, 0); // 归零时间，只比较日期
                    const releaseDate = new Date(item.releaseDate);
                    const daysDiff = Math.ceil(
                      (releaseDate.getTime() - now.getTime()) /
                        (1000 * 60 * 60 * 24),
                    );

                    // 根据天数差异动态更新显示文字
                    if (daysDiff < 0) {
                      const daysAgo = Math.abs(daysDiff);
                      calculatedRemarks = `已上映${daysAgo}天`;
                    } else if (daysDiff === 0) {
                      calculatedRemarks = '今日上映';
                    } else {
                      calculatedRemarks = `${daysDiff}天后上映`;
                    }
                  }

                  return (
                    <div key={item.id + item.source} className='w-full'>
                      <VideoCard
                        query={item.search_title}
                        {...item}
                        from='favorite'
                        remarks={calculatedRemarks}
                      />
                    </div>
                  );
                })}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                    {/* SVG 插画 - 空收藏夹 */}
                    <div className='mb-6 relative'>
                      <div className='absolute inset-0 bg-linear-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
                      <svg
                        className='w-32 h-32 relative z-10'
                        viewBox='0 0 200 200'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        {/* 心形主体 */}
                        <path
                          d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500 transition-colors duration-300'
                          strokeWidth='3'
                        />
                        {/* 虚线边框 */}
                        <path
                          d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeDasharray='5,5'
                          className='text-gray-400 dark:text-gray-500'
                        />
                      </svg>
                    </div>

                    {/* 文字提示 */}
                    <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      收藏夹空空如也
                    </h3>
                    <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
                      快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
                    </p>
                  </div>
                )}
              </div>

              {/* 确认对话框 */}
              <ConfirmDialog
                isOpen={showClearFavoritesDialog}
                title='确认清空收藏'
                message={`确定要清空所有收藏吗？\n\n这将删除 ${favoriteItems.length} 项收藏，此操作无法撤销。`}
                confirmText='确认清空'
                cancelText='取消'
                variant='danger'
                onConfirm={handleClearFavorites}
                onCancel={() => setShowClearFavoritesDialog(false)}
              />
            </section>
          ) : (
            // 首页视图
            <>
              {/* HeroBanner 轮播 */}
              {hasHeroItems && (
                <section className='mb-8'>
                  <HeroBanner
                    items={[
                      // 豆瓣电影
                      ...hotMovies.slice(0, 2).map((movie) => ({
                        id: movie.id,
                        title: movie.title,
                        poster: movie.poster,
                        backdrop: movie.backdrop,
                        trailerUrl: movie.trailerUrl,
                        description: movie.plot_summary,
                        year: movie.year,
                        rate: movie.rate,
                        douban_id: Number(movie.id),
                        type: 'movie',
                      })),
                      // 豆瓣电视剧
                      ...hotTvShows.slice(0, 2).map((show) => ({
                        id: show.id,
                        title: show.title,
                        poster: show.poster,
                        backdrop: show.backdrop,
                        trailerUrl: show.trailerUrl,
                        description: show.plot_summary,
                        year: show.year,
                        rate: show.rate,
                        douban_id: Number(show.id),
                        type: 'tv',
                      })),
                      // 豆瓣综艺
                      ...hotVarietyShows.slice(0, 1).map((show) => ({
                        id: show.id,
                        title: show.title,
                        poster: show.poster,
                        backdrop: show.backdrop,
                        trailerUrl: show.trailerUrl,
                        description: show.plot_summary,
                        year: show.year,
                        rate: show.rate,
                        douban_id: Number(show.id),
                        type: 'variety',
                      })),
                      // 豆瓣动漫
                      ...hotAnime.slice(0, 1).map((anime) => ({
                        id: anime.id,
                        title: anime.title,
                        poster: anime.poster,
                        backdrop: anime.backdrop,
                        trailerUrl: anime.trailerUrl,
                        description: anime.plot_summary,
                        year: anime.year,
                        rate: anime.rate,
                        douban_id: Number(anime.id),
                        type: 'anime',
                      })),
                    ]}
                    autoPlayInterval={8000}
                    showControls={true}
                    showIndicators={true}
                    enableVideo={true}
                  />
                </section>
              )}

              {/* 继续观看 */}
              <ContinueWatching />

              {/* 即将上映 */}
              {!loadingUpcoming && processedUpcomingReleases.length > 0 && (
                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle
                      title='即将上映'
                      icon={Calendar}
                      iconColor='text-orange-500'
                    />
                    <Link
                      href='/release-calendar'
                      className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>

                  {/* Tab 切换 */}
                  <div className='mb-4 flex gap-2'>
                    {[
                      {
                        key: 'all',
                        label: '全部',
                        count: processedUpcomingReleases.length,
                      },
                      {
                        key: 'movie',
                        label: '电影',
                        count: processedUpcomingReleases.filter(
                          (r) => r.type === 'movie',
                        ).length,
                      },
                      {
                        key: 'tv',
                        label: '电视剧',
                        count: processedUpcomingReleases.filter(
                          (r) => r.type === 'tv',
                        ).length,
                      },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() =>
                          setUpcomingFilter(key as 'all' | 'movie' | 'tv')
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          upcomingFilter === key
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span
                            className={`ml-1.5 text-xs ${
                              upcomingFilter === key
                                ? 'text-white/80'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            ({count})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <ScrollableRow enableVirtualization={true}>
                    {processedUpcomingReleases
                      .filter(
                        (release) =>
                          upcomingFilter === 'all' ||
                          release.type === upcomingFilter,
                      )
                      .map((release, index) => {
                        // 计算距离上映还有几天
                        const now = new Date();
                        now.setHours(0, 0, 0, 0); // 归零时间，只比较日期
                        const releaseDate = new Date(release.releaseDate);
                        const daysDiff = Math.ceil(
                          (releaseDate.getTime() - now.getTime()) /
                            (1000 * 60 * 60 * 24),
                        );

                        // 根据天数差异显示不同文字
                        let remarksText;
                        if (daysDiff < 0) {
                          remarksText = `已上映${Math.abs(daysDiff)}天`;
                        } else if (daysDiff === 0) {
                          remarksText = '今日上映';
                        } else {
                          remarksText = `${daysDiff}天后上映`;
                        }

                        return (
                          <div
                            key={`${release.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              source='upcoming_release'
                              id={release.id}
                              source_name='即将上映'
                              from='douban'
                              title={release.title}
                              poster={release.cover || ''}
                              year={release.releaseDate.split('-')[0]}
                              type={release.type}
                              remarks={remarksText}
                              releaseDate={release.releaseDate}
                              query={release.title}
                              priority={index < 6}
                              episodes={
                                release.episodes ||
                                (release.type === 'tv' ? undefined : 1)
                              }
                            />
                          </div>
                        );
                      })}
                  </ScrollableRow>
                </section>
              )}

              {/* 热门电影 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门电影'
                    icon={Film}
                    iconColor='text-red-500'
                  />
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loadingHotMovies
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={movie.id}
                            source_name='豆瓣'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={Number(movie.id)}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                            priority={index < 6}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门剧集 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门剧集'
                    icon={Tv}
                    iconColor='text-blue-500'
                  />
                  <Link
                    href='/douban?type=tv'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loadingHotTvShows
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='tv'
                            priority={index < 6}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 每日新番放送 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='新番放送'
                    icon={Calendar}
                    iconColor='text-purple-500'
                  />
                  <Link
                    href='/douban?type=anime'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loadingBangumi
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 展示当前日期的番剧
                      (() => {
                        // 获取当前日期对应的星期
                        const today = new Date();
                        const weekdays = [
                          'Sun',
                          'Mon',
                          'Tue',
                          'Wed',
                          'Thu',
                          'Fri',
                          'Sat',
                        ];
                        const currentWeekday = weekdays[today.getDay()];

                        // 找到当前星期对应的番剧数据
                        const todayAnimes =
                          bangumiCalendarData.find(
                            (item) => item.weekday.en === currentWeekday,
                          )?.items || [];

                        return todayAnimes.map((anime, index) => (
                          <div
                            key={`${anime.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              from='douban'
                              source='bangumi'
                              id={anime.id.toString()}
                              source_name='Bangumi'
                              title={anime.name_cn || anime.name}
                              poster={
                                anime.images?.large ||
                                anime.images?.common ||
                                anime.images?.medium ||
                                anime.images?.small ||
                                anime.images?.grid ||
                                ''
                              }
                              douban_id={anime.id}
                              rate={anime.rating?.score?.toFixed(1) || ''}
                              year={anime.air_date?.split('-')?.[0] || ''}
                              isBangumi={true}
                              priority={index < 6}
                            />
                          </div>
                        ));
                      })()}
                </ScrollableRow>
              </section>

              {/* 热门综艺 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门综艺'
                    icon={Sparkles}
                    iconColor='text-pink-500'
                  />
                  <Link
                    href='/douban?type=show'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loadingVarietyShows
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='variety'
                            priority={index < 6}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门短剧 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门短剧'
                    icon={Play}
                    iconColor='text-orange-500'
                  />
                  <Link
                    href='/shortdrama'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loadingShortDramas
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotShortDramas.map((drama, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <ShortDramaCard drama={drama} priority={index < 6} />
                        </div>
                      ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
          onTouchStart={(e) => {
            // 如果点击的是背景区域，阻止触摸事件冒泡，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            // 如果触摸的是背景区域，阻止触摸移动，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            // 如果触摸的是背景区域，阻止触摸结束事件，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none', // 禁用所有触摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
              // 允许公告内容区域正常滚动，阻止事件冒泡到外层
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto', // 允许内容区域的正常触摸操作
            }}
          >
            <div className='mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-linear-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
