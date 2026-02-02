import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, loadConfig } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 标记为动态路由
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const name = searchParams.get('name'); // 短剧名称

    if (!name) {
      return NextResponse.json(
        { error: '缺少必要参数: name' },
        { status: 400 },
      );
    }

    // 读取配置以获取备用API地址
    let primaryApiUrl: string | undefined;

    try {
      const config = await loadConfig();
      const shortDramaConfig = config.ShortDramaConfig;
      primaryApiUrl = shortDramaConfig?.primaryApiUrl;
    } catch (configError) {
      console.error('读取短剧配置失败:', configError);
    }

    // 如果没有启用备用API或没有配置地址，返回错误
    if (!primaryApiUrl) {
      return NextResponse.json(
        { error: '备用API未启用或未配置' },
        { status: 503 },
      );
    }

    // 使用备用API搜索短剧获取集数
    const searchUrl = `${primaryApiUrl}/api/v1/drama/d?dramaName=${encodeURIComponent(name)}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!searchResponse.ok) {
      // 精确搜索失败，尝试模糊搜索
      const fuzzySearchUrl = `${primaryApiUrl}/api/v1/drama/dl?dramaName=${encodeURIComponent(name)}`;
      const fuzzyResponse = await fetch(fuzzySearchUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/json',
        },
      });

      if (!fuzzyResponse.ok) {
        return NextResponse.json({ error: '备用API请求失败' }, { status: 502 });
      }

      const fuzzyData = await fuzzyResponse.json();

      if (
        !fuzzyData ||
        !fuzzyData.data ||
        !Array.isArray(fuzzyData.data) ||
        fuzzyData.data.length === 0
      ) {
        return NextResponse.json({ error: '未找到该短剧' }, { status: 404 });
      }

      const firstDrama = fuzzyData.data[0];
      const episodeCount = firstDrama.episode || 0;

      const response = {
        episodeCount,
        dramaName: firstDrama.name || name,
        source: 'alternative-api-fuzzy',
      };

      // 设置缓存
      const cacheTime = await getCacheTime();
      const finalResponse = NextResponse.json(response);
      finalResponse.headers.set(
        'Cache-Control',
        `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
      );
      finalResponse.headers.set(
        'CDN-Cache-Control',
        `public, s-maxage=${cacheTime}`,
      );
      finalResponse.headers.set(
        'Vercel-CDN-Cache-Control',
        `public, s-maxage=${cacheTime}`,
      );

      return finalResponse;
    }

    const searchData = await searchResponse.json();

    // 验证返回数据
    if (!searchData || typeof searchData !== 'object') {
      return NextResponse.json(
        { error: '备用API返回数据格式错误' },
        { status: 502 },
      );
    }

    // 精确搜索返回单个对象
    const episodeCount = searchData.episode || 0;

    const response = {
      episodeCount,
      dramaName: searchData.name || name,
      source: 'alternative-api',
    };

    // 设置缓存
    const cacheTime = await getCacheTime();
    const finalResponse = NextResponse.json(response);
    finalResponse.headers.set(
      'Cache-Control',
      `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
    );
    finalResponse.headers.set(
      'CDN-Cache-Control',
      `public, s-maxage=${cacheTime}`,
    );
    finalResponse.headers.set(
      'Vercel-CDN-Cache-Control',
      `public, s-maxage=${cacheTime}`,
    );

    return finalResponse;
  } catch (error) {
    console.error('获取集数失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
