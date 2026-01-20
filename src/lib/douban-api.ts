import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

/**
 * 刷新过期的 Douban trailer URL
 * 不使用任何缓存，直接调用豆瓣移动端API获取最新URL
 */

// 带重试的获取函数
export async function fetchTrailerWithRetry(
  id: string,
  retryCount = 0,
): Promise<string | null> {
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

    if (!trailerUrl) {
      console.warn(`[refresh-trailer] 影片 ${id} 没有预告片数据`);
      throw new Error('该影片没有预告片');
    }
    console.log(`[refresh-trailer] 影片 ${id} 刷新成功. url = ${trailerUrl}`);
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
        return fetchTrailerWithRetry(id, retryCount + 1);
      }
    }
    throw error;
  }
}
