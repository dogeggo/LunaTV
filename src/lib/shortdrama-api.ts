/* eslint-disable no-console */

import {
  getCache,
  getShortdramaCacheKey,
  setCache,
  SHORTDRAMA_CACHE_EXPIRE,
} from './cache';
import {
  SearchResult,
  ShortDramaCategory,
  ShortDramaItem,
  ShortDramaParseResult,
} from './types';
import { DEFAULT_USER_AGENT } from './user-agent';
import { processImageUrl } from './utils';

// 检测是否为移动端环境
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
};

// 获取API基础URL - 浏览器端使用内部API代理，服务端直接调用外部API
const getApiBase = async (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;
  const [path, rawQuery] = normalizedEndpoint.split('?');
  const query = rawQuery ? `?${rawQuery}` : '';

  if (typeof window !== 'undefined') {
    const internalPath = path.startsWith('/parse/') ? '/parse' : path;
    return `/api/shortdrama${internalPath}${query}`;
  }

  const { loadConfig } = await import('@/lib/config');
  const config = await loadConfig();
  const serverPath = path === '/parse' ? '/vod/parse/single' : `/vod${path}`;

  // 服务端使用外部API的完整路径
  return `${config.ShortDramaConfig.primaryApiUrl}${serverPath}${query}`;
};

export interface ShortDramaDetailOptions {
  id: string;
  videoId: number;
  episode: number;
  name?: string;
}

export async function getShortDramaDetail(
  options: ShortDramaDetailOptions,
): Promise<SearchResult> {
  const { id, videoId, episode, name } = options;
  const cacheKey = getShortdramaCacheKey('shortdrama-detail-', {
    shortdramaId: id,
  });
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }
  let response: SearchResult;
  if (typeof window !== 'undefined') {
    const titleParam = name ? `&name=${encodeURIComponent(name)}` : '';
    const apiUrl = await getApiBase(
      `/detail?id=${videoId}&episode=${episode}${titleParam}`,
    );
    let response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`获取短剧详情失败 url = ${response.url}`);
    }
    response = await response.json();
  } else {
    // 先尝试指定集数
    let result = await parseShortDramaEpisode(videoId, episode, true);

    // 如果失败，尝试其他集数
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(
        videoId,
        episode === 1 ? 2 : 1,
        true,
      );
    }

    // 如果还是失败，尝试第0集
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(videoId, 0, true);
    }
    if (result.code !== 0 || !result.data) {
      throw new Error(result.msg || '解析失败');
    }
    const totalEpisodes = Math.max(result.data.totalEpisodes || 1, 1);
    // 转换为兼容格式
    // 注意：始终使用请求的原始ID（主API的ID）
    response = {
      id: id, // 使用原始请求ID，保持一致性
      title: result.data.videoName,
      poster: result.data.cover ? processImageUrl(result.data.cover) : '',
      episodes: Array.from(
        { length: totalEpisodes },
        (_, i) => `shortdrama:${id}:${i}`, // 使用原始请求ID
      ),
      episodes_titles: Array.from(
        { length: totalEpisodes },
        (_, i) => `第${i + 1}集`,
      ),
      source: 'shortdrama',
      source_name: '短剧',
      year: new Date().getFullYear().toString(),
      desc: result.data.description,
      type_name: '短剧',
    };
  }
  await setCache(cacheKey, response, SHORTDRAMA_CACHE_EXPIRE.details);
  return response;
}

// 获取短剧分类列表
export async function getShortDramaCategories(): Promise<ShortDramaCategory[]> {
  const cacheKey = getShortdramaCacheKey('categories', {});

  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }

    const useInternalApi = typeof window !== 'undefined';
    const apiUrl = await getApiBase('/categories');

    // 浏览器端使用内部API，服务端调用外部API
    const fetchOptions: RequestInit = useInternalApi
      ? {
          // 浏览器端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: ShortDramaCategory[];
    // 内部API直接返回数组，外部API返回带categories的对象
    if (useInternalApi) {
      result = data; // 内部API已经处理过格式
    } else {
      const categories = data.categories || [];
      result = categories.map((item: any) => ({
        type_id: item.type_id,
        type_name: item.type_name,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.categories);
    return result;
  } catch (error) {
    console.error('获取短剧分类失败:', error);
    return [];
  }
}

// 获取推荐短剧列表
export async function getRecommendedShortDramas(
  category?: number,
  size = 10,
): Promise<ShortDramaItem[]> {
  const cacheKey = getShortdramaCacheKey('recommends', { category, size });

  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }
    const params = new URLSearchParams();
    if (category) params.append('category', category.toString());
    params.append('size', size.toString());
    const useInternalApi = typeof window !== 'undefined';
    const apiUrl = await getApiBase(`/recommend?${params.toString()}`);

    const fetchOptions: RequestInit = useInternalApi
      ? {
          // 浏览器端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let result: ShortDramaItem[];
    if (useInternalApi) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.items || [];
      result = items.map((item: any) => ({
        id: item.vod_id || item.id,
        name: item.vod_name || item.name,
        cover:
          item.vod_pic || item.cover
            ? processImageUrl(item.vod_pic || item.cover)
            : '',
        update_time:
          item.vod_time || item.update_time || new Date().toISOString(),
        score: item.vod_score || item.score || 0,
        episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
        description: item.vod_content || item.description || '',
        author: item.vod_actor || item.author || '',
        backdrop:
          item.vod_pic_slide || item.backdrop || item.vod_pic || item.cover,
        vote_average: item.vod_score || item.vote_average || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.recommends);
    return result;
  } catch (error) {
    console.error('获取推荐短剧失败:', error);
    return [];
  }
}

// 获取分类短剧列表（分页）
export async function getShortDramaList(
  category: number,
  page = 1,
  size = 20,
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  const cacheKey = getShortdramaCacheKey('lists', { category, page, size });

  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }
    const useInternalApi = typeof window !== 'undefined';
    const apiUrl = await getApiBase(
      `/list?categoryId=${category}&page=${page}&size=${size}`,
    );

    const fetchOptions: RequestInit = useInternalApi
      ? {
          // 浏览器端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (useInternalApi) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover ? processImageUrl(item.cover) : '',
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 分页API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));

      result = {
        list,
        hasMore: data.currentPage < data.totalPages, // 使用totalPages判断是否还有更多
      };
    }

    // 缓存结果 - 第一页缓存时间更长
    const cacheTime =
      page === 1
        ? SHORTDRAMA_CACHE_EXPIRE.lists * 2
        : SHORTDRAMA_CACHE_EXPIRE.lists;
    await setCache(cacheKey, result, cacheTime);
    return result;
  } catch (error) {
    console.error('获取短剧列表失败:', error);
    return { list: [], hasMore: false };
  }
}

// 搜索短剧
export async function searchShortDramas(
  query: string,
  page = 1,
  size = 20,
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  try {
    const useInternalApi = typeof window !== 'undefined';
    const params = new URLSearchParams();
    if (useInternalApi) {
      params.set('query', query);
    } else {
      params.set('name', query);
    }
    params.set('page', page.toString());
    params.set('size', size.toString());
    const apiUrl = await getApiBase(`/search?${params.toString()}`);

    const fetchOptions: RequestInit = useInternalApi
      ? {
          // 浏览器端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (useInternalApi) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 搜索API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));

      result = {
        list,
        hasMore: data.currentPage < data.totalPages,
      };
    }

    return result;
  } catch (error) {
    console.error('搜索短剧失败:', error);
    return { list: [], hasMore: false };
  }
}

// 解析单集视频（支持跨域代理）
export async function parseShortDramaEpisode(
  id: number,
  episode: number,
  useProxy = true,
): Promise<ShortDramaParseResult> {
  try {
    const params = new URLSearchParams({
      id: id.toString(), // API需要string类型的id
      episode: episode.toString(), // episode从1开始
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const useInternalApi = typeof window !== 'undefined';
    const apiEndpoint = useInternalApi
      ? `/parse/single?${params.toString()}&_t=${timestamp}`
      : `/parse/single?${params.toString()}`;
    const apiUrl = await getApiBase(apiEndpoint);

    const fetchOptions: RequestInit = useInternalApi
      ? {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // API可能返回错误信息
    if (data.code === 1) {
      return {
        code: data.code,
        msg: data.msg || '该集暂时无法播放，请稍后再试',
      };
    }

    // API成功时，检查是否有有效的视频链接
    const parsedUrl = data.episode?.parsedUrl || data.parsedUrl || '';

    // API成功时直接返回数据对象，根据实际结构解析
    return {
      code: 0,
      data: {
        videoId: data.videoId || id,
        videoName: data.videoName || '',
        currentEpisode: data.episode?.index || episode,
        totalEpisodes: data.totalEpisodes || 1,
        parsedUrl: parsedUrl,
        proxyUrl: data.episode?.proxyUrl || '', // proxyUrl在episode对象内
        cover: data.cover || '',
        description: data.description || '',
        episode: data.episode || null, // 保留原始episode对象
      },
    };
  } catch (error) {
    console.error('解析短剧集数失败:', error);
    return {
      code: -1,
      msg: '网络连接失败，请检查网络后重试',
    };
  }
}

// 批量解析多集视频
export async function parseShortDramaBatch(
  id: number,
  episodes: number[],
  useProxy = true,
): Promise<ShortDramaParseResult[]> {
  try {
    const params = new URLSearchParams({
      id: id.toString(),
      episodes: episodes.join(','),
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const useInternalApi = typeof window !== 'undefined';
    const apiEndpoint = useInternalApi
      ? `/parse/batch?${params.toString()}&_t=${timestamp}`
      : `/parse/batch?${params.toString()}`;
    const apiUrl = await getApiBase(apiEndpoint);

    const fetchOptions: RequestInit = useInternalApi
      ? {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('批量解析短剧失败:', error);
    return [];
  }
}

// 解析整部短剧所有集数
export async function parseShortDramaAll(
  id: number,
  useProxy = true,
): Promise<ShortDramaParseResult[]> {
  try {
    const params = new URLSearchParams({
      id: id.toString(),
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const useInternalApi = typeof window !== 'undefined';
    const apiEndpoint = useInternalApi
      ? `/parse/all?${params.toString()}&_t=${timestamp}`
      : `/parse/all?${params.toString()}`;
    const apiUrl = await getApiBase(apiEndpoint);

    const fetchOptions: RequestInit = useInternalApi
      ? {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      : {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'application/json',
          },
        };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('解析完整短剧失败:', error);
    return [];
  }
}
