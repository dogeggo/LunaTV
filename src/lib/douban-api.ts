import { db } from '@/lib/db';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

/**
 * 刷新过期的 Douban trailer URL
 * 使用数据库缓存，缓存7天
 */

const CACHE_EXPIRE_SECONDS = 7 * 24 * 60 * 60; // 7 days

type TrailerFetchOptions = {
  includeBackdrop?: boolean;
};

type TrailerWithBackdrop = {
  trailerUrl?: string;
  backdrop?: string;
};

function getBackdropFromMobileData(data: any): string | undefined {
  let backdrop =
    data.cover?.image?.raw?.url ||
    data.cover?.image?.large?.url ||
    data.cover?.image?.normal?.url ||
    data.pic?.large ||
    undefined;

  if (backdrop) {
    backdrop = backdrop
      .replace('/view/photo/s/', '/view/photo/l/')
      .replace('/view/photo/m/', '/view/photo/l/')
      .replace('/view/photo/sqxs/', '/view/photo/l/')
      .replace('/s_ratio_poster/', '/l_ratio_poster/')
      .replace('/m_ratio_poster/', '/l_ratio_poster/');
  }

  return backdrop;
}

// 带重试的获取函数
export async function fetchTrailerWithRetry(
  id: string,
  retryCount?: number,
): Promise<string | null>;
export async function fetchTrailerWithRetry(
  id: string,
  retryCount: number | undefined,
  options: TrailerFetchOptions & { includeBackdrop: true },
): Promise<TrailerWithBackdrop | null>;
export async function fetchTrailerWithRetry(
  id: string,
  retryCount: number | undefined,
  options?: TrailerFetchOptions,
): Promise<string | null>;
export async function fetchTrailerWithRetry(
  id: string,
  retryCount = 0,
  options?: TrailerFetchOptions,
): Promise<string | TrailerWithBackdrop | null> {
  const includeBackdrop = options?.includeBackdrop === true;
  const cacheKey = `douban:trailer:${id}`;

  try {
    const cachedData = (await db.getCache(
      cacheKey,
    )) as TrailerWithBackdrop | null;
    if (cachedData) {
      if (includeBackdrop) {
        return cachedData;
      }
      if (cachedData.trailerUrl) {
        return cachedData.trailerUrl;
      }
    }
  } catch (e) {
    console.error(`[refresh-trailer] 读取缓存失败: ${e}`);
  }

  const MAX_RETRIES = 2;
  const TIMEOUT = 20000; // 20秒超时
  const RETRY_DELAY = 2000; // 2秒后重试

  const startTime = Date.now();

  try {
    // 先尝试 movie 端点
    let mobileApiUrl = `https://m.douban.com/rexxar/api/v2/movie/${id}`;

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    let response = await fetch(mobileApiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Referer: 'https://movie.douban.com/explore',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        Origin: 'https://movie.douban.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      redirect: 'manual', // 手动处理重定向
    });

    clearTimeout(timeoutId);

    // 如果是 3xx 重定向，说明可能是电视剧，尝试 tv 端点
    if (response.status >= 300 && response.status < 400) {
      mobileApiUrl = `https://m.douban.com/rexxar/api/v2/tv/${id}`;

      const tvController = new AbortController();
      const tvTimeoutId = setTimeout(() => tvController.abort(), TIMEOUT);

      response = await fetch(mobileApiUrl, {
        signal: tvController.signal,
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: 'https://movie.douban.com/explore',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Origin: 'https://movie.douban.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        },
      });

      clearTimeout(tvTimeoutId);
    }

    if (!response.ok) {
      throw new Error(`豆瓣API返回错误: ${response.status}`);
    }

    const data = await response.json();
    const trailerUrl = data.trailers?.[0]?.video_url;
    const backdrop = includeBackdrop
      ? getBackdropFromMobileData(data)
      : undefined;

    if (!trailerUrl) {
      console.warn(`[refresh-trailer] 影片 ${id} 没有预告片数据`);
      if (includeBackdrop) {
        const cachedData = { trailerUrl: undefined, backdrop };
        await db.setCache(cacheKey, cachedData, CACHE_EXPIRE_SECONDS);
        return cachedData;
      }
      throw new Error('该影片没有预告片');
    }
    console.log(`[refresh-trailer] 影片 ${id} 刷新成功. url = ${trailerUrl}`);

    // 写入缓存
    const cachedData = { trailerUrl, backdrop };
    await db.setCache(cacheKey, cachedData, CACHE_EXPIRE_SECONDS);

    if (includeBackdrop) {
      return cachedData;
    }
    return trailerUrl;
  } catch (error) {
    const failTime = Date.now() - startTime;
    // 超时或网络错误，尝试重试
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('fetch'))
    ) {
      console.error(
        `[refresh-trailer] 影片 ${id} 请求失败 (耗时: ${failTime}ms): ${error.name === 'AbortError' ? '超时' : error.message}`,
      );

      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return fetchTrailerWithRetry(id, retryCount + 1, options);
      }
    }
    throw error;
  }
}
