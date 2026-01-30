import { NextRequest, NextResponse } from 'next/server';

import { SHORTDRAMA_CACHE_EXPIRE } from '@/lib/cache';
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
