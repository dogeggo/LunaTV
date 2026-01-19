import fs from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import stream from 'stream';
import { promisify } from 'util';

import { fetchTrailerWithRetry } from '@/lib/douban-api';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

const pipeline = promisify(stream.pipeline);
const CACHE_DIR = path.join(process.cwd(), 'cache', 'video');
const downloadingFiles = new Set<string>();
// 内存缓存：douban_id -> trailerUrl
const doubanIdToTrailerUrl = new Map<string, string>();

// Ensure cache directory exists
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create cache dir', e);
}

export const runtime = 'nodejs';

// 视频代理接口 - 支持流式传输和Range请求
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let videoUrl = searchParams.get('url');
  const doubanId = searchParams.get('id');

  // 如果没有 url 但有 id，尝试获取 url
  if (!videoUrl && doubanId) {
    // 1. 查内存缓存
    if (doubanIdToTrailerUrl.has(doubanId)) {
      videoUrl = doubanIdToTrailerUrl.get(doubanId)!;
    } else {
      // 2. 调用豆瓣 API 获取
      try {
        const fetchedUrl = await fetchTrailerWithRetry(doubanId);
        if (fetchedUrl) {
          videoUrl = fetchedUrl;
          doubanIdToTrailerUrl.set(doubanId, fetchedUrl);
        }
      } catch (e) {
        console.error(
          `[Video Proxy] Failed to fetch trailer for ${doubanId}:`,
          e,
        );
      }
    }
  }

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  }

  // URL 格式验证
  try {
    new URL(videoUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // 获取客户端的 Range 请求头
  const rangeHeader = request.headers.get('range');
  // 获取条件请求头（用于缓存重验证）
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

  try {
    // 动态设置 Referer 和 Origin（根据视频源域名）
    const videoUrlObj = new URL(videoUrl);
    const sourceOrigin = `${videoUrlObj.protocol}//${videoUrlObj.host}`;

    // 针对豆瓣的特殊处理
    let referer = sourceOrigin + '/';
    if (videoUrl.includes('douban')) {
      referer = 'https://movie.douban.com/';
    }

    // 构建请求头
    const fetchHeaders: HeadersInit = {
      Referer: referer,
      Origin: sourceOrigin,
      'User-Agent': DEFAULT_USER_AGENT,
      Accept:
        'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity;q=1, *;q=0',
      Connection: 'keep-alive',
    };

    // --- 本地缓存逻辑 ---
    // 仅针对 vt1.doubanio.com 进行缓存和完整返回
    if (videoUrl.includes('vt1.doubanio.com')) {
      // 提取文件名：从 URL 路径中获取最后一部分
      const urlPath = new URL(videoUrl).pathname;
      const filename = path.basename(urlPath); // 例如 "703230195.mp4"
      const filePath = path.join(CACHE_DIR, filename);

      if (fs.existsSync(filePath)) {
        console.log(`[Cache] HIT: ${filename}`);
        try {
          // 强制返回完整文件
          return serveLocalFile(request, filePath);
        } catch (e) {
          console.error('[Cache] Error serving local file:', e);
        }
      } else {
        // 触发后台下载（不带 Range 头）
        console.log(`[Cache] MISS: ${filename}`);
        if (!downloadingFiles.has(filename)) {
          downloadingFiles.add(filename);
          const downloadHeaders = { ...fetchHeaders };
          // @ts-ignore
          delete downloadHeaders['Range'];

          downloadToCache(videoUrl, filePath, downloadHeaders)
            .catch((err) =>
              console.error('[Cache] Background download failed:', err),
            )
            .finally(() => downloadingFiles.delete(filename));
        }
      }
    }

    // 如果客户端发送了 Range 请求，转发给目标服务器
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // 转发条件请求头（用于缓存重验证）
    if (ifNoneMatch) {
      fetchHeaders['If-None-Match'] = ifNoneMatch;
    }
    if (ifModifiedSince) {
      fetchHeaders['If-Modified-Since'] = ifModifiedSince;
    }

    const videoResponse = await fetch(videoUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    });

    clearTimeout(timeoutId);

    // 处理 304 Not Modified（缓存重验证成功）
    if (videoResponse.status === 304) {
      const headers = new Headers();
      const etag = videoResponse.headers.get('etag');
      const lastModified = videoResponse.headers.get('last-modified');

      if (etag) headers.set('ETag', etag);
      if (lastModified) headers.set('Last-Modified', lastModified);

      headers.set(
        'Cache-Control',
        'public, max-age=1800, stale-while-revalidate=900, must-revalidate',
      );
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(null, {
        status: 304,
        headers,
      });
    }

    if (!videoResponse.ok) {
      const errorResponse = NextResponse.json(
        {
          error: 'Failed to fetch video',
          status: videoResponse.status,
          statusText: videoResponse.statusText,
        },
        { status: videoResponse.status },
      );
      // 错误响应不缓存，避免缓存失效的视频链接
      errorResponse.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
      return errorResponse;
    }

    if (!videoResponse.body) {
      return NextResponse.json(
        { error: 'Video response has no body' },
        { status: 500 },
      );
    }

    const contentType = videoResponse.headers.get('content-type');
    const contentLength = videoResponse.headers.get('content-length');
    const contentRange = videoResponse.headers.get('content-range');
    const acceptRanges = videoResponse.headers.get('accept-ranges');
    const etag = videoResponse.headers.get('etag');
    const lastModified = videoResponse.headers.get('last-modified');

    // 创建响应头
    const headers = new Headers();
    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentRange) headers.set('Content-Range', contentRange);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    if (etag) headers.set('ETag', etag);
    if (lastModified) headers.set('Last-Modified', lastModified);

    // 设置缓存头（视频30分钟缓存 + 智能重验证）
    // 使用 stale-while-revalidate 策略：允许在后台重新验证时提供旧内容
    // 但添加 must-revalidate 确保过期后必须验证源服务器
    // trailer URL 有时效性，使用较短的 30 分钟缓存
    headers.set(
      'Cache-Control',
      'public, max-age=1800, stale-while-revalidate=900, must-revalidate',
    );
    // CDN缓存：30分钟 + 15分钟宽限期
    headers.set(
      'CDN-Cache-Control',
      'public, s-maxage=1800, stale-while-revalidate=900',
    );

    // 添加 CORS 支持
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');

    // 返回正确的状态码：Range请求返回206，完整请求返回200
    const statusCode = rangeHeader && contentRange ? 206 : 200;

    // 直接返回视频流
    return new Response(videoResponse.body, {
      status: statusCode,
      headers,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    // 错误类型判断
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Video fetch timeout (30s)' },
        { status: 504 },
      );
    }
    console.error('[Video Proxy] Error fetching video:', error.message);
    return NextResponse.json(
      { error: 'Error fetching video', details: error.message },
      { status: 500 },
    );
  }
}

// 处理 HEAD 请求（用于获取视频元数据）
export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    // 动态设置 Referer 和 Origin（根据视频源域名）
    const videoUrlObj = new URL(videoUrl);
    const sourceOrigin = `${videoUrlObj.protocol}//${videoUrlObj.host}`;

    // 针对豆瓣的特殊处理
    let referer = sourceOrigin + '/';
    if (videoUrl.includes('douban')) {
      referer = 'https://movie.douban.com/';
    }

    const videoResponse = await fetch(videoUrl, {
      method: 'HEAD',
      headers: {
        Referer: referer,
        Origin: sourceOrigin,
        'User-Agent': DEFAULT_USER_AGENT,
        Accept:
          'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity;q=1, *;q=0',
        Connection: 'keep-alive',
      },
    });

    const headers = new Headers();
    const contentType = videoResponse.headers.get('content-type');
    const contentLength = videoResponse.headers.get('content-length');
    const acceptRanges = videoResponse.headers.get('accept-ranges');
    const etag = videoResponse.headers.get('etag');
    const lastModified = videoResponse.headers.get('last-modified');

    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    if (etag) headers.set('ETag', etag);
    if (lastModified) headers.set('Last-Modified', lastModified);

    headers.set('Access-Control-Allow-Origin', '*');
    headers.set(
      'Cache-Control',
      'public, max-age=3600, stale-while-revalidate=1800, must-revalidate',
    );

    return new NextResponse(null, {
      status: videoResponse.status,
      headers,
    });
  } catch (error: any) {
    console.error('[Video Proxy] HEAD request error:', error.message);
    return new NextResponse(null, { status: 500 });
  }
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}

// 辅助函数：后台下载视频到缓存
async function downloadToCache(url: string, filePath: string, headers: any) {
  const tempPath = `${filePath}.tmp`;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok || !response.body) {
      console.error(`[Cache] Failed to fetch source: ${response.status}`);
      return;
    }

    const fileStream = fs.createWriteStream(tempPath);
    // @ts-ignore
    const reader = stream.Readable.fromWeb(response.body);
    await pipeline(reader, fileStream);

    // 等待文件流完全关闭
    fileStream.close();

    // 简单的重试机制，确保文件句柄释放
    let retries = 3;
    while (retries > 0) {
      try {
        console.log(`[VideoCache] Successfully cached: ${filePath}`);
        fs.renameSync(tempPath, filePath);
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
    console.error(`[Cache] Download error:`, error);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

// 辅助函数：服务本地缓存文件 (始终返回完整文件)
function serveLocalFile(request: Request, filePath: string) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mtime = stat.mtime.toUTCString();
  const etag = `"${fileSize.toString(16)}-${stat.mtime.getTime().toString(16)}"`;

  // 检查缓存是否有效 (304 Not Modified)
  // 即使是完整文件请求，如果客户端发送了验证头，也应该支持 304
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (ifNoneMatch === etag || ifModifiedSince === mtime) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
        'Last-Modified': mtime,
        'X-Cache-Status': 'HIT',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'video/mp4');
  headers.set('Content-Length', fileSize.toString());
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Cache-Status', 'HIT');
  headers.set('ETag', etag);
  headers.set('Last-Modified', mtime);

  // 手动转换 Node Stream 到 Web Stream
  const streamToWeb = (nodeStream: fs.ReadStream) => {
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch (e) {
            nodeStream.destroy();
          }
        });
        nodeStream.on('end', () => {
          try {
            controller.close();
          } catch (e) {}
        });
        nodeStream.on('error', (err) => {
          try {
            controller.error(err);
          } catch (e) {}
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });
  };

  const fileStream = fs.createReadStream(filePath);
  const webStream = streamToWeb(fileStream);

  return new Response(webStream, { status: 200, headers });
}
