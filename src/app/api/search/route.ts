/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { SEARCH_CACHE_EXPIRE } from '@/lib/cache';
import { getAvailableApiSites, loadConfig } from '@/lib/config';
import { generateSearchVariants, searchFromApi } from '@/lib/downstream';
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
    const cacheTime = SEARCH_CACHE_EXPIRE;
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
  const config = await loadConfig();
  const searchVariants = generateSearchVariants(query);
  const maxPage: number = config.SiteConfig.SearchDownstreamMaxPage;
  // 添加超时控制和错误处理，避免慢接口拖累整体响应
  const searchPromises = apiSites.map((site) =>
    Promise.race([
      searchFromApi(site, searchVariants, maxPage, authInfo.username),
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
      console.log(
        `视频搜索完成. username = ${authInfo.username}, length = ${flattenedResults.length}, query = ${query}, searchVariants = ${searchVariants}`,
      );
      return NextResponse.json({ results: [] }, { status: 200 });
    }
    console.log(
      `视频搜索完成. username = ${authInfo.username}, length = ${flattenedResults.length}, query = ${query}, searchVariants = ${searchVariants}`,
    );
    const cacheTime = SEARCH_CACHE_EXPIRE;
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
