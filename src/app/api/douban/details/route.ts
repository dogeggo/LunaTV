import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchTrailerWithRetry } from '@/lib/douban-api';
import {
  DoubanSubjectFetchError,
  DoubanSubjectPageScraper,
} from '@/lib/douban-subject-page';

export const runtime = 'nodejs';
const FAILURE_CACHE_SECONDS = 30 * 60;

/**
 * 使用 unstable_cache 包裹移动端API请求
 * - 30分钟缓存（trailer URL 有时效性，需要较短缓存）
 * - 与详情页缓存分开管理
 * - Next.js会自动根据函数参数区分缓存
 */
const fetchMobileApiData = unstable_cache(
  async (id: string) => {
    try {
      return await fetchTrailerWithRetry(id, 0, { includeBackdrop: true });
    } catch (error) {
      return null;
    }
  },
  ['douban-mobile-api'],
  {
    revalidate: 1800, // 30分钟缓存
    tags: ['douban-mobile'],
  },
);

// ============================================================================
// 核心爬虫函数（带缓存）
// ============================================================================

/**
 * 爬取豆瓣详情页面（内部函数）
 */
/**
 * 错误类型枚举
 */
class DoubanError extends Error {
  constructor(
    message: string,
    public code:
      | 'TIMEOUT'
      | 'RATE_LIMIT'
      | 'SERVER_ERROR'
      | 'PARSE_ERROR'
      | 'NETWORK_ERROR',
    public status?: number,
  ) {
    super(message);
    this.name = 'DoubanError';
  }
}

/**
 * 带重试的爬取函数
 */
async function _scrapeDoubanDetails(id: string, retryCount = 0): Promise<any> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 8000]; // 指数退避

  try {
    const html = await DoubanSubjectPageScraper.getHtml(id, {
      timeoutMs: 20000,
      minRequestIntervalMs: 2000,
      randomDelayMs: [500, 1500],
    });
    // 解析详情信息
    return parseDoubanDetails(html, id);
  } catch (error) {
    // 超时错误
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new DoubanError(
        '请求超时，豆瓣响应过慢',
        'TIMEOUT',
        504,
      );

      // 超时重试
      if (retryCount < MAX_RETRIES) {
        console.warn(`[Douban] 超时，重试 ${retryCount + 1}/${MAX_RETRIES}...`);
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[retryCount]),
        );
        return _scrapeDoubanDetails(id, retryCount + 1);
      }

      throw timeoutError;
    }

    if (error instanceof DoubanSubjectFetchError) {
      const status = error.status;
      let mapped: DoubanError;
      if (status === 429) {
        mapped = new DoubanError('请求过于频繁，请稍后再试', 'RATE_LIMIT', 429);
      } else if (status && status >= 500) {
        mapped = new DoubanError(
          `豆瓣服务器错误 ${status}`,
          'SERVER_ERROR',
          status,
        );
      } else if (status === 404) {
        return {
          code: 404,
          message: `影片不存在 ${id}`,
          data: null,
        };
      } else if (status) {
        mapped = new DoubanError(
          `HTTP错误: ${status}`,
          'NETWORK_ERROR',
          status,
        );
      } else {
        mapped = new DoubanError(error.message, 'NETWORK_ERROR');
      }

      if (
        (mapped.code === 'RATE_LIMIT' || mapped.code === 'SERVER_ERROR') &&
        retryCount < MAX_RETRIES
      ) {
        console.warn(
          `[Douban] ${mapped.message}，重试 ${retryCount + 1}/${MAX_RETRIES}...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[retryCount]),
        );
        return _scrapeDoubanDetails(id, retryCount + 1);
      }
      throw mapped;
    }

    // DoubanError 直接抛出
    if (error instanceof DoubanError) {
      // 速率限制或服务器错误重试
      if (
        (error.code === 'RATE_LIMIT' || error.code === 'SERVER_ERROR') &&
        retryCount < MAX_RETRIES
      ) {
        console.warn(
          `[Douban] ${error.message}，重试 ${retryCount + 1}/${MAX_RETRIES}...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[retryCount]),
        );
        return _scrapeDoubanDetails(id, retryCount + 1);
      }
      throw error;
    }

    // 其他错误
    throw new DoubanError(
      error instanceof Error ? error.message : '未知网络错误',
      'NETWORK_ERROR',
    );
  }
}

/**
 * 使用 unstable_cache 包裹爬虫函数
 * - 自动重新验证
 * - Next.js会自动根据函数参数区分缓存
 */
export const scrapeDoubanDetails = unstable_cache(
  async (id: string, retryCount = 0) => _scrapeDoubanDetails(id, retryCount),
  ['douban-details'],
  {
    revalidate: await getCacheTime(),
    tags: ['douban'],
  },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      {
        code: 400,
        message: '缺少必要参数: id',
        error: 'MISSING_PARAMETER',
      },
      { status: 400 },
    );
  }

  const failureCacheKey = `douban-details-fail-id=${id}`;
  const failureCacheHeaders = {
    'Cache-Control': `public, max-age=${FAILURE_CACHE_SECONDS}, s-maxage=${FAILURE_CACHE_SECONDS}, stale-while-revalidate=${FAILURE_CACHE_SECONDS}`,
    'CDN-Cache-Control': `public, s-maxage=${FAILURE_CACHE_SECONDS}`,
    'Vercel-CDN-Cache-Control': `public, s-maxage=${FAILURE_CACHE_SECONDS}`,
    'Netlify-Vary': 'query',
    'X-Data-Source': 'error-cache',
  };

  const saveFailureCache = async (
    status: number,
    body: {
      code: number;
      message: string;
      error: string;
      details: string;
    },
  ) => {
    try {
      await db.setCache(
        failureCacheKey,
        {
          status,
          body,
        },
        FAILURE_CACHE_SECONDS,
      );
    } catch (cacheError) {
      console.warn('[Douban] 失败缓存写入失败:', cacheError);
    }
  };

  try {
    const cachedFailure = await db.getCache(failureCacheKey);
    if (cachedFailure?.status && cachedFailure?.body) {
      return NextResponse.json(cachedFailure.body, {
        status: cachedFailure.status,
        headers: failureCacheHeaders,
      });
    }
  } catch (cacheError) {
    console.warn('[Douban] 失败缓存读取失败:', cacheError);
  }

  try {
    // 并行获取详情和移动端API数据
    const [details, mobileData] = await Promise.all([
      scrapeDoubanDetails(id),
      fetchMobileApiData(id),
    ]);

    // 合并数据：混合使用爬虫和移动端API的优势
    if (details.code === 200 && details.data && mobileData) {
      // 预告片来自移动端API
      details.data.trailerUrl = mobileData.trailerUrl;
      // Backdrop优先使用爬虫的剧照（横版高清），否则用移动端API的海报
      if (!details.data.backdrop && mobileData.backdrop) {
        details.data.backdrop = mobileData.backdrop;
      }
    }

    try {
      await db.deleteCache(failureCacheKey);
    } catch (cacheError) {
      console.warn('[Douban] 失败缓存清理失败:', cacheError);
    }

    const trailerSafeCacheTime = await getCacheTime();
    const cacheHeaders = {
      'Cache-Control': `public, max-age=${trailerSafeCacheTime}, s-maxage=${trailerSafeCacheTime}, stale-while-revalidate=${trailerSafeCacheTime}`,
      'CDN-Cache-Control': `public, s-maxage=${trailerSafeCacheTime}`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${trailerSafeCacheTime}`,
      'Netlify-Vary': 'query',
      'X-Data-Source': 'scraper-cached',
    };

    return NextResponse.json(details, { headers: cacheHeaders });
  } catch (error) {
    // 处理 DoubanError
    if (error instanceof DoubanError) {
      const statusCode =
        error.status ||
        (error.code === 'TIMEOUT'
          ? 504
          : error.code === 'RATE_LIMIT'
            ? 429
            : error.code === 'SERVER_ERROR'
              ? 502
              : 500);

      const responseBody = {
        code: statusCode,
        message: error.message,
        error: error.code,
        details: `获取豆瓣详情失败 (ID: ${id})`,
      };
      await saveFailureCache(statusCode, responseBody);
      return NextResponse.json(responseBody, {
        status: statusCode,
        headers: failureCacheHeaders,
      });
    }

    // 解析错误
    if (error instanceof Error && error.message.includes('解析')) {
      const responseBody = {
        code: 500,
        message: '解析豆瓣数据失败，可能是页面结构已变化',
        error: 'PARSE_ERROR',
        details: error.message,
      };
      await saveFailureCache(500, responseBody);
      return NextResponse.json(responseBody, {
        status: 500,
        headers: failureCacheHeaders,
      });
    }

    // 未知错误
    const responseBody = {
      code: 500,
      message: '获取豆瓣详情失败',
      error: 'UNKNOWN_ERROR',
      details: error instanceof Error ? error.message : '未知错误',
    };
    await saveFailureCache(500, responseBody);
    return NextResponse.json(responseBody, {
      status: 500,
      headers: failureCacheHeaders,
    });
  }
}

function parseDoubanDetails(html: string, id: string) {
  try {
    // 提取基本信息
    const titleMatch = html.match(
      /<h1[^>]*>[\s\S]*?<span[^>]*property="v:itemreviewed"[^>]*>([^<]+)<\/span>/,
    );
    const title = titleMatch ? titleMatch[1].trim() : '';

    // 提取海报
    const posterMatch = html.match(
      /<a[^>]*class="nbgnbg"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/,
    );
    const poster = posterMatch ? posterMatch[1] : '';

    // 提取评分
    const ratingMatch = html.match(
      /<strong[^>]*class="ll rating_num"[^>]*property="v:average">([^<]+)<\/strong>/,
    );
    const rate = ratingMatch ? ratingMatch[1] : '';

    // 提取年份
    const yearMatch = html.match(
      /<span[^>]*class="year">[(]([^)]+)[)]<\/span>/,
    );
    const year = yearMatch ? yearMatch[1] : '';

    // 根据真实HTML结构提取导演、编剧、主演
    let directors: string[] = [];
    let screenwriters: string[] = [];
    let cast: string[] = [];

    // 导演：<span class='pl'>导演</span>: <span class='attrs'><a href="..." rel="v:directedBy">刘家成</a></span>
    const directorMatch = html.match(
      /<span class=['"]pl['"]>导演<\/span>:\s*<span class=['"]attrs['"]>(.*?)<\/span>/,
    );
    if (directorMatch) {
      const directorLinks = directorMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g);
      if (directorLinks) {
        directors = directorLinks
          .map((link) => {
            const nameMatch = link.match(/>([^<]+)</);
            return nameMatch ? nameMatch[1].trim() : '';
          })
          .filter(Boolean);
      }
    }

    // 编剧：<span class='pl'>编剧</span>: <span class='attrs'><a href="...">王贺</a></span>
    const writerMatch = html.match(
      /<span class=['"]pl['"]>编剧<\/span>:\s*<span class=['"]attrs['"]>(.*?)<\/span>/,
    );
    if (writerMatch) {
      const writerLinks = writerMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g);
      if (writerLinks) {
        screenwriters = writerLinks
          .map((link) => {
            const nameMatch = link.match(/>([^<]+)</);
            return nameMatch ? nameMatch[1].trim() : '';
          })
          .filter(Boolean);
      }
    }

    // 主演：<span class='pl'>主演</span>: <span class='attrs'><a href="..." rel="v:starring">杨幂</a> / <a href="...">欧豪</a> / ...</span>
    const castMatch = html.match(
      /<span class=['"]pl['"]>主演<\/span>:\s*<span class=['"]attrs['"]>(.*?)<\/span>/,
    );
    if (castMatch) {
      const castLinks = castMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g);
      if (castLinks) {
        cast = castLinks
          .map((link) => {
            const nameMatch = link.match(/>([^<]+)</);
            return nameMatch ? nameMatch[1].trim() : '';
          })
          .filter(Boolean);
      }
    }

    // 提取演员照片（从 celebrities 区域）- 增强版
    const celebrities: Array<{
      id: string;
      name: string;
      avatar: string;
      role: string;
      avatars?: {
        small: string;
        medium: string;
        large: string;
      };
    }> = [];

    const celebritiesSection = html.match(
      /<div id="celebrities"[\s\S]*?<ul class="celebrities-list[^"]*">([\s\S]*?)<\/ul>/,
    );
    if (celebritiesSection) {
      const celebrityItems = celebritiesSection[1].match(
        /<li class="celebrity">[\s\S]*?<\/li>/g,
      );
      if (celebrityItems) {
        celebrityItems.forEach((item) => {
          // 提取演员ID和名字 - 支持 personage 和 celebrity 两种URL格式
          const linkMatch = item.match(
            /<a href="https:\/\/www\.douban\.com\/(personage|celebrity)\/(\d+)\/[^"]*"\s+title="([^"]+)"/,
          );

          // 🎯 三种方法提取头像 URL
          let avatarUrl = '';

          // 方法 1: CSS 背景图（最常见）
          const bgMatch = item.match(/background-image:\s*url\(([^)]+)\)/);
          if (bgMatch) {
            avatarUrl = bgMatch[1].replace(/^['"]|['"]$/g, ''); // 去掉引号
          }

          // 方法 2: IMG 标签 (fallback)
          if (!avatarUrl) {
            const imgMatch = item.match(/<img[^>]*src="([^"]+)"/);
            if (imgMatch) {
              avatarUrl = imgMatch[1];
            }
          }

          // 方法 3: data-src 属性
          if (!avatarUrl) {
            const dataSrcMatch = item.match(/data-src="([^"]+)"/);
            if (dataSrcMatch) {
              avatarUrl = dataSrcMatch[1];
            }
          }

          // 提取角色
          const roleMatch = item.match(
            /<span class="role"[^>]*>([^<]+)<\/span>/,
          );

          if (linkMatch && avatarUrl) {
            // 清理URL
            avatarUrl = avatarUrl.trim().replace(/^http:/, 'https:');

            // 🎨 高清图替换：/s/ → /l/, /m/ → /l/
            const largeUrl = avatarUrl
              .replace(/\/s\//, '/l/')
              .replace(/\/m\//, '/l/')
              .replace('/s_ratio/', '/l_ratio/')
              .replace('/m_ratio/', '/l_ratio/')
              .replace('/small/', '/large/')
              .replace('/medium/', '/large/');

            // 过滤掉默认头像
            const isDefaultAvatar =
              avatarUrl.includes('personage-default') ||
              avatarUrl.includes('celebrity-default') ||
              avatarUrl.includes('has_douban');

            if (!isDefaultAvatar) {
              celebrities.push({
                id: linkMatch[2], // 第二个捕获组是ID
                name: linkMatch[3].split(' ')[0], // 第三个捕获组是名字，只取中文名
                avatar: avatarUrl,
                role: roleMatch ? roleMatch[1].trim() : '',
                // 🎯 新增：返回三种尺寸的头像
                avatars: {
                  small: largeUrl
                    .replace('/l/', '/s/')
                    .replace('/l_ratio/', '/s_ratio/')
                    .replace('/large/', '/small/'),
                  medium: largeUrl
                    .replace('/l/', '/m/')
                    .replace('/l_ratio/', '/m_ratio/')
                    .replace('/large/', '/medium/'),
                  large: largeUrl,
                },
              });
            }
          }
        });
      }
    }

    // 提取推荐影片
    const recommendations: Array<{
      id: string;
      title: string;
      poster: string;
      rate: string;
    }> = [];

    const recommendationsSection = html.match(
      /<div id="recommendations">[\s\S]*?<div class="recommendations-bd">([\s\S]*?)<\/div>/,
    );
    if (recommendationsSection) {
      const recommendItems =
        recommendationsSection[1].match(/<dl>[\s\S]*?<\/dl>/g);
      if (recommendItems) {
        recommendItems.forEach((item) => {
          // 提取影片ID
          const idMatch = item.match(/\/subject\/(\d+)\//);
          // 提取标题
          const titleMatch = item.match(/alt="([^"]+)"/);
          // 提取海报
          const posterMatch = item.match(/<img src="([^"]+)"/);
          // 提取评分
          const rateMatch = item.match(
            /<span class="subject-rate">([^<]+)<\/span>/,
          );

          if (idMatch && titleMatch && posterMatch) {
            recommendations.push({
              id: idMatch[1],
              title: titleMatch[1],
              poster: posterMatch[1],
              rate: rateMatch ? rateMatch[1] : '',
            });
          }
        });
      }
    }

    // 提取类型
    const genreMatches = html.match(
      /<span[^>]*property="v:genre">([^<]+)<\/span>/g,
    );
    const genres = genreMatches
      ? genreMatches
          .map((match) => {
            const result = match.match(
              /<span[^>]*property="v:genre">([^<]+)<\/span>/,
            );
            return result ? result[1] : '';
          })
          .filter(Boolean)
      : [];

    // 提取制片国家/地区
    const countryMatch = html.match(
      /<span[^>]*class="pl">制片国家\/地区:<\/span>([^<]+)/,
    );
    const countries = countryMatch
      ? countryMatch[1]
          .trim()
          .split('/')
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    // 提取语言
    const languageMatch = html.match(
      /<span[^>]*class="pl">语言:<\/span>([^<]+)/,
    );
    const languages = languageMatch
      ? languageMatch[1]
          .trim()
          .split('/')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    // 提取首播/上映日期 - 根据真实HTML结构
    let first_aired = '';

    // 首播信息：<span class="pl">首播:</span> <span property="v:initialReleaseDate" content="2025-08-13(中国大陆)">2025-08-13(中国大陆)</span>
    const firstAiredMatch = html.match(
      /<span class="pl">首播:<\/span>\s*<span[^>]*property="v:initialReleaseDate"[^>]*content="([^"]*)"[^>]*>([^<]*)<\/span>/,
    );
    if (firstAiredMatch) {
      first_aired = firstAiredMatch[1]; // 使用content属性的值
    } else {
      // 如果没有首播，尝试上映日期 - 可能有多个日期，取第一个
      const releaseDateMatch = html.match(
        /<span class="pl">上映日期:<\/span>\s*<span[^>]*property="v:initialReleaseDate"[^>]*content="([^"]*)"[^>]*>([^<]*)<\/span>/,
      );
      if (releaseDateMatch) {
        first_aired = releaseDateMatch[1];
      }
    }

    // 提取集数（仅剧集有）
    const episodesMatch = html.match(
      /<span[^>]*class="pl">集数:<\/span>([^<]+)/,
    );
    const episodes = episodesMatch
      ? parseInt(episodesMatch[1].trim()) || undefined
      : undefined;

    // 提取时长 - 支持电影和剧集
    let episode_length: number | undefined;
    let movie_duration: number | undefined;

    // 先尝试提取剧集的单集片长
    const singleEpisodeDurationMatch = html.match(
      /<span[^>]*class="pl">单集片长:<\/span>([^<]+)/,
    );
    if (singleEpisodeDurationMatch) {
      episode_length =
        parseInt(singleEpisodeDurationMatch[1].trim()) || undefined;
    } else {
      // 如果没有单集片长，尝试提取电影的总片长
      const movieDurationMatch = html.match(
        /<span[^>]*class="pl">片长:<\/span>([^<]+)/,
      );
      if (movieDurationMatch) {
        movie_duration = parseInt(movieDurationMatch[1].trim()) || undefined;
      }
    }

    // 提取剧情简介 - 使用更宽松的匹配，支持HTML标签
    const summaryMatch =
      html.match(/<span[^>]*class="all hidden">([\s\S]*?)<\/span>/) ||
      html.match(/<span[^>]*property="v:summary"[^>]*>([\s\S]*?)<\/span>/);
    let plot_summary = '';
    if (summaryMatch) {
      // 移除HTML标签，保留文本内容
      plot_summary = summaryMatch[1]
        .replace(/<br\s*\/?>/gi, '\n') // 将<br>转换为换行
        .replace(/<[^>]+>/g, '') // 移除其他HTML标签
        .trim()
        .replace(/\n{3,}/g, '\n\n'); // 将多个换行合并为最多两个
    }

    // 🎬 提取剧照作为backdrop（横版高清图，比竖版海报更适合做背景）
    let scenePhoto: string | undefined;
    const photosSection = html.match(
      /<div[^>]*id="related-pic"[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/,
    );
    if (photosSection) {
      // 查找第一张剧照图片URL
      const photoMatch = photosSection[1].match(
        /https:\/\/img[0-9]\.doubanio\.com\/view\/photo\/[a-z_]*\/public\/p[0-9]+\.jpg/,
      );
      if (photoMatch) {
        // 转换为高清版本（使用l而不是raw，避免重定向）
        scenePhoto = photoMatch[0]
          .replace(/^http:/, 'https:')
          .replace('/view/photo/s/', '/view/photo/l/')
          .replace('/view/photo/m/', '/view/photo/l/')
          .replace('/view/photo/sqxs/', '/view/photo/l/');
      }
    }

    return {
      code: 200,
      message: '获取成功',
      data: {
        id,
        title,
        poster: poster.replace(/^http:/, 'https:'),
        rate,
        year,
        directors,
        screenwriters,
        cast,
        genres,
        countries,
        languages,
        episodes,
        episode_length,
        movie_duration,
        first_aired,
        plot_summary,
        celebrities,
        recommendations,
        // 🎯 新增：将 celebrities 中的演员单独提取为 actors 字段
        actors: celebrities.filter((c) => !c.role.includes('导演')),
        // 🎬 剧照作为backdrop（横版高清图）
        backdrop: scenePhoto,
        // 🎬 预告片URL（由移动端API填充）
        trailerUrl: undefined,
      },
    };
  } catch (error) {
    throw new DoubanError(
      `解析豆瓣详情页面失败: ${error instanceof Error ? error.message : '未知错误'}`,
      'PARSE_ERROR',
    );
  }
}
