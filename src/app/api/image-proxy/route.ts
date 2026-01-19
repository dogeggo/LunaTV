import fs from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import stream from 'stream';
import { promisify } from 'util';

import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

const pipeline = promisify(stream.pipeline);
const CACHE_DIR = path.join(process.cwd(), 'cache', 'image');
const downloadingFiles = new Set<string>();

// Ensure cache directory exists
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create image cache dir', e);
}

export const runtime = 'nodejs';

// 图片代理接口 - 解决防盗链和 Mixed Content 问题
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  // URL 格式验证
  try {
    new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    // 动态设置 Referer 和 Origin（根据图片源域名）
    const imageUrlObj = new URL(imageUrl);
    const sourceOrigin = `${imageUrlObj.protocol}//${imageUrlObj.host}`;

    // --- 本地缓存逻辑 ---
    // 提取文件名：从 URL 路径中获取最后一部分
    const urlPath = imageUrlObj.pathname;
    const filename = path.basename(urlPath);
    const filePath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filePath)) {
      try {
        console.log(`[ImageCache] HIT: ${filename}`);
        return serveLocalFile(request, filePath);
      } catch (e) {
        console.error('[ImageCache] Error serving local file:', e);
      }
    } else {
      console.log(`[ImageCache] MISS: ${filename}`);
      // 触发后台下载
      if (!downloadingFiles.has(filename)) {
        downloadingFiles.add(filename);
        const downloadHeaders = {
          Referer: sourceOrigin + '/',
          'User-Agent': DEFAULT_USER_AGENT,
        };

        downloadToCache(imageUrl, filePath, downloadHeaders)
          .catch((err) =>
            console.error('[ImageCache] Background download failed:', err),
          )
          .finally(() => downloadingFiles.delete(filename));
      }
    }
    // ------------------

    // 构建请求头
    const fetchHeaders: HeadersInit = {
      Referer: sourceOrigin + '/',
      Origin: sourceOrigin,
      'User-Agent': DEFAULT_USER_AGENT,
      Accept:
        'image/avif,image/webp,image/jxl,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    };

    const imageResponse = await fetch(imageUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    });

    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      const errorResponse = NextResponse.json(
        {
          error: 'Failed to fetch image',
          status: imageResponse.status,
          statusText: imageResponse.statusText,
        },
        { status: imageResponse.status },
      );
      // 错误响应不缓存，避免缓存失效的图片链接
      errorResponse.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
      return errorResponse;
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 },
      );
    }

    // 创建响应头
    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    // 传递Content-Length以支持进度显示和更好的缓存（如果上游提供）
    const contentLength = imageResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // 设置缓存头 - 缓存7天（604800秒），允许重新验证
    headers.set(
      'Cache-Control',
      'public, max-age=604800, stale-while-revalidate=86400',
    );
    headers.set('CDN-Cache-Control', 'public, s-maxage=604800');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=604800');

    // 添加 CORS 支持
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // 直接返回图片流
    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);

    // 错误类型判断
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Image fetch timeout (15s)' },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: 'Error fetching image', details: error.message },
      { status: 500 },
    );
  }
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// 辅助函数：后台下载图片到缓存
async function downloadToCache(url: string, filePath: string, headers: any) {
  const tempPath = `${filePath}.tmp`;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok || !response.body) {
      console.error(`[ImageCache] Failed to fetch source: ${response.status}`);
      return;
    }

    const fileStream = fs.createWriteStream(tempPath);
    // @ts-ignore
    const reader = stream.Readable.fromWeb(response.body);
    await pipeline(reader, fileStream);

    fileStream.close();

    // 简单的重试机制
    let retries = 3;
    while (retries > 0) {
      try {
        fs.renameSync(tempPath, filePath);
        console.log(`[ImageCache] Successfully cached: ${filePath}`);
        break;
      } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM') {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          throw e;
        }
      }
    }
  } catch (error) {
    console.error(`[ImageCache] Download error:`, error);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

// 辅助函数：服务本地缓存文件
function serveLocalFile(request: Request, filePath: string) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mtime = stat.mtime.toUTCString();
  // 使用强 ETag
  const etag = `"${fileSize.toString(16)}-${stat.mtime.getTime().toString(16)}"`;

  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  // 检查缓存是否有效 (304 Not Modified)
  if (ifNoneMatch === etag || ifModifiedSince === mtime) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': 'public, max-age=604800, immutable',
        'CDN-Cache-Control': 'public, s-maxage=604800',
        ETag: etag,
        'Last-Modified': mtime,
        'X-Cache-Status': 'HIT',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const headers = new Headers();
  // 根据扩展名猜测 Content-Type，或者直接用 image/jpeg (大部分是 jpg)
  // 更好的做法是读取文件头或根据扩展名
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'image/jpeg';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.svg') contentType = 'image/svg+xml';

  headers.set('Content-Type', contentType);
  headers.set('Content-Length', fileSize.toString());
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=604800, immutable');
  headers.set('CDN-Cache-Control', 'public, s-maxage=604800');
  headers.set('X-Cache-Status', 'HIT');
  headers.set('ETag', etag);
  headers.set('Last-Modified', mtime);

  const fileStream = fs.createReadStream(filePath);
  // @ts-ignore
  const webStream = stream.Readable.toWeb(fileStream);

  return new Response(webStream as any, { status: 200, headers });
}
