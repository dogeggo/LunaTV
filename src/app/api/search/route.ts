/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { generateSearchVariants } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      },
    );
  }

  const apiSites = await getAvailableApiSites(authInfo.username);

  // 优化：预计算搜索变体，避免每个源重复计算（43个源 × 3次转换 = 129次转换）
  const searchVariants = generateSearchVariants(query).slice(0, 2);

  // 添加超时控制和错误处理，避免慢接口拖累整体响应
  // 移除数字变体后，统一使用智能搜索变体
  const searchPromises: Promise<SearchResult[]>[] = apiSites.map((site) =>
    Promise.race([
      searchFromApi(site, query, searchVariants, authInfo.username), // 传入预计算的变体
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${site.name} timeout`)), 15000),
      ),
    ]).catch((err) => {
      console.warn(`搜索失败 ${site.name}:`, err.message);
      return []; // 返回空数组而不是抛出错误
    }),
  );

  try {
    const results = await Promise.all(searchPromises);
    let flattenedResults: SearchResult[] = results.flat();
    if (flattenedResults.length === 0) {
      // no cache if empty
      return NextResponse.json({ results: [] }, { status: 200 });
    }
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      },
    );
  } catch (_error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
