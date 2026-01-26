import { NextRequest, NextResponse } from 'next/server';

import { SHORTDRAMA_CACHE_EXPIRE } from '@/lib/cache';
import { loadConfig } from '@/lib/config';
import { getShortDramaDetail } from '@/lib/shortdrama-api';

// 标记为动态路由
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const episode = searchParams.get('episode');
    const name = searchParams.get('name'); // 可选：用于备用API

    if (!id) {
      return NextResponse.json({ error: '缺少必要参数: id' }, { status: 400 });
    }

    const videoId = parseInt(id);
    const episodeNum = episode ? parseInt(episode) : 1;

    if (isNaN(videoId) || isNaN(episodeNum)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 读取配置以获取备用API地址
    let alternativeApiUrl: string | undefined;
    try {
      const config = await loadConfig();
      const shortDramaConfig = config.ShortDramaConfig;
      alternativeApiUrl = shortDramaConfig?.enableAlternative
        ? shortDramaConfig.alternativeApiUrl
        : undefined;

      // 调试日志
      console.log('[ShortDrama Detail] 配置读取:', {
        hasConfig: !!shortDramaConfig,
        enableAlternative: shortDramaConfig?.enableAlternative,
        hasAlternativeUrl: !!alternativeApiUrl,
        name: name,
      });
    } catch (configError) {
      console.error('读取短剧配置失败:', configError);
      // 配置读取失败时，不使用备用API
      alternativeApiUrl = undefined;
    }

    let detail: Awaited<ReturnType<typeof getShortDramaDetail>>;
    try {
      detail = await getShortDramaDetail({
        id,
        videoId,
        episode: episodeNum,
        name: name || undefined,
      });
    } catch (detailError) {
      const message =
        detailError instanceof Error && detailError.message
          ? detailError.message
          : '解析失败';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // 设置与豆瓣一致的缓存策略
    const cacheTime = SHORTDRAMA_CACHE_EXPIRE.details;
    const finalResponse = NextResponse.json(detail);
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
    finalResponse.headers.set('Netlify-Vary', 'query');

    return finalResponse;
  } catch (error) {
    console.error('短剧详情获取失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
