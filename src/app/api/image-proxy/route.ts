import crypto from 'crypto';
import fs from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import stream from 'stream';
import { promisify } from 'util';

import {
  fetchDoubanWithAntiScraping,
  isDoubanUrl,
} from '@/lib/douban-challenge';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

const pipeline = promisify(stream.pipeline);
const CACHE_DIR = path.join(process.cwd(), 'cache', 'image');

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

  try {
    // 动态设置 Referer 和 Origin（根据图片源域名）
    const imageUrlObj = new URL(imageUrl);
    const sourceOrigin = `${imageUrlObj.protocol}//${imageUrlObj.host}`;

    // --- 本地缓存逻辑 ---
    // 提取文件名：使用 URL 的 MD5 哈希作为文件名，避免不同分辨率(s/m/l)的文件名冲突
    // 例如：.../photo/s/p123.jpg 和 .../photo/l/p123.jpg 如果只用 basename 都会是 p123.jpg
    const urlPath = imageUrlObj.pathname;
    const ext = path.extname(urlPath) || '.jpg'; // 默认 .jpg
    const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const filename = `${urlHash}${ext}`;
    const filePath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filePath)) {
      try {
        console.log(`[ImageCache] HIT: ${filename}`);
        return serveLocalFile(request, filePath);
      } catch (e) {
        console.error('[ImageCache] Error serving local file:', e);
        throw e;
      }
    } else {
      console.log(`[ImageCache] MISS: ${filename}`);
      const downloadHeaders = {
        Referer: sourceOrigin + '/',
        'User-Agent': DEFAULT_USER_AGENT,
      };
      const result = await downloadToCache(imageUrl, filePath, downloadHeaders);
      if (result) {
        try {
          console.log(`[ImageCache] HIT: ${filename}`);
          return serveLocalFile(request, filePath);
        } catch (e) {
          console.error('[ImageCache] Error serving local file:', e);
          throw e;
        }
      } else {
        const errorResponse = NextResponse.json(
          {
            error: 'Failed to fetch image',
            status: 500,
          },
          { status: 500 },
        );
        errorResponse.headers.set(
          'Cache-Control',
          'no-cache, no-store, must-revalidate',
        );
        return errorResponse;
      }
    }
  } catch (error: any) {
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = isDoubanUrl(url)
      ? await fetchDoubanWithAntiScraping(url, {
          signal: controller.signal,
          timeoutMs: 0,
        })
      : await fetch(url, {
          headers,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });
    if (!response.ok || !response.body) {
      console.error(
        `[ImageCache] Failed to fetch source: ${response.status}, url = ${response.url}`,
      );
      return false;
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
        await fs.promises.rename(tempPath, filePath);
        console.log(`[ImageCache] Successfully cached: ${filePath}`);
        break;
      } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM') {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          return false;
        }
      }
    }
  } catch (error) {
    console.error(`[ImageCache] Download error:`, error);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return false;
  }
  return true;
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
