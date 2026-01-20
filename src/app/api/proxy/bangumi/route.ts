import { NextRequest, NextResponse } from 'next/server';

/**
 * Bangumi API 代理路由
 * 解决客户端直接调用 Bangumi API 可能遇到的 CORS 问题
 *
 * 用法:
 * GET /api/proxy/bangumi?path=calendar
 * GET /api/proxy/bangumi?path=v0/subjects/12345
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json(
      { error: 'Missing path parameter' },
      { status: 400 },
    );
  }

  try {
    const apiUrl = `https://api.bgm.tv/${path}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
      },
      next: {
        // 缓存5分钟
        revalidate: 300,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Bangumi API returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();

    // 递归处理数据中的图片 URL，替换为 image-proxy
    const processImages = (obj: any): any => {
      if (!obj) return obj;

      if (Array.isArray(obj)) {
        return obj.map((item) => processImages(item));
      }

      if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            // 检查是否是图片 URL 字段
            if (
              (key === 'large' ||
                key === 'common' ||
                key === 'medium' ||
                key === 'small' ||
                key === 'grid') &&
              typeof value === 'string' &&
              value.startsWith('http')
            ) {
              newObj[key] = `/api/image-proxy?url=${encodeURIComponent(value)}`;
            } else {
              newObj[key] = processImages(value);
            }
          }
        }
        return newObj;
      }

      return obj;
    };

    const processedData = processImages(data);

    // 返回数据，并设置 CORS 头允许前端访问
    return NextResponse.json(processedData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Bangumi API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bangumi API' },
      { status: 500 },
    );
  }
}
