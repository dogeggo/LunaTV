import { NextResponse } from 'next/server';

import {
  DOUBAN_CACHE_EXPIRE,
  fetchDoubanData,
  getDoubanComments,
} from '@/lib/douban-api';

// 请求限制器
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1200; // 1.2秒最小间隔

function randomDelay(min = 300, max = 800): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export const runtime = 'nodejs';

interface DoubanInterestUser {
  id?: string;
  uid?: string;
  name?: string;
  avatar?: string;
  loc?: {
    name?: string;
  };
  url?: string;
}

interface DoubanInterestItem {
  comment?: string;
  rating?: {
    value?: number;
  };
  user?: DoubanInterestUser;
  create_time?: string;
  vote_count?: number;
  ip_location?: string;
}

interface DoubanInterestsApiResponse {
  count: number;
  start: number;
  total: number;
  interests: DoubanInterestItem[];
}

interface DoubanComment {
  username: string;
  user_id: string;
  avatar: string;
  rating: number; // 0-5, 0表示未评分
  time: string;
  location: string;
  content: string;
  useful_count: number;
}

function buildInterestsUrl(
  kind: 'movie' | 'tv',
  id: string,
  start: number,
  count: number,
  sort: string,
) {
  return `https://m.douban.com/rexxar/api/v2/${kind}/${id}/interests?start=${start}&count=${count}&status=P&sort=${sort}`;
}

async function fetchInterestsData(
  url: string,
  userAgent: string,
): Promise<{ status: number; data?: DoubanInterestsApiResponse }> {
  try {
    const data = (await fetchDoubanData(url)) as DoubanInterestsApiResponse;
    return { status: 200, data };
  } catch (error) {
    throw error;
  }
}

async function getInterests(
  id: string,
  start: number,
  count: number,
  sort: string,
  userAgent: string,
): Promise<DoubanInterestsApiResponse> {
  const movieUrl = buildInterestsUrl('movie', id, start, count, sort);
  const movieResult = await fetchInterestsData(movieUrl, userAgent);
  if (movieResult.data) {
    return movieResult.data;
  }

  const tvUrl = buildInterestsUrl('tv', id, start, count, sort);
  const tvResult = await fetchInterestsData(tvUrl, userAgent);
  if (tvResult.data) {
    return tvResult.data;
  }

  throw new Error(
    `HTTP error! Status: ${movieResult.status}${tvResult.status ? `/${tvResult.status}` : ''}`,
  );
}

function parseDoubanInterests(
  data: DoubanInterestsApiResponse,
): DoubanComment[] {
  const interests = Array.isArray(data.interests) ? data.interests : [];
  const comments: DoubanComment[] = [];

  for (const item of interests) {
    const username = item.user?.name?.trim() || '';
    const content = item.comment?.trim() || '';
    if (!username || !content) continue;

    const userId = item.user?.id || item.user?.uid || '';
    const avatar = item.user?.avatar
      ? item.user.avatar.replace(/^http:/, 'https:')
      : '';
    const rating = Number(item.rating?.value || 0);
    const time = item.create_time || '';
    const location =
      item.user?.loc?.name?.trim() || item.ip_location?.trim() || '';
    const usefulCount = Number(item.vote_count || 0);

    comments.push({
      username,
      user_id: userId,
      avatar,
      rating,
      time,
      location,
      content,
      useful_count: usefulCount,
    });
  }

  return comments;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const start = parseInt(searchParams.get('start') || '0');
  const limit = parseInt(searchParams.get('limit') || '10');
  const sort = searchParams.get('sort') || 'new_score'; // new_score 或 time

  if (!id) {
    return NextResponse.json({ error: '缺少必要参数: id' }, { status: 400 });
  }
  // 验证参数
  if (limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: 'limit 必须在 1-50 之间' },
      { status: 400 },
    );
  }
  if (start < 0) {
    return NextResponse.json({ error: 'start 不能小于 0' }, { status: 400 });
  }

  if (sort !== 'new_score' && sort !== 'time') {
    return NextResponse.json(
      { error: 'sort 参数必须是 new_score 或 time' },
      { status: 400 },
    );
  }

  try {
    const result = await getDoubanComments({
      id,
      start,
      limit,
      sort,
    });
    const cacheTime = DOUBAN_CACHE_EXPIRE.comments;
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取豆瓣短评失败', details: (error as Error).message },
      { status: 500 },
    );
  }
}
