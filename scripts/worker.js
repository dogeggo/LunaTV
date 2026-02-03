export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;

    // 需要缓存的资源类型
    const isProxyApi =
      url.pathname.includes('/api/image-proxy') ||
      url.pathname.includes('/api/video-proxy');
    const isStaticAsset = url.pathname.match(
      /\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|mjs|map|json|woff2|woff|ttf|otf|mp4|webm|mp3|m4a|ogg|wav|wasm|webmanifest|pdf|xml)$/i,
    );
    const hasRange = request.headers.has('Range');
    const isCache = (isProxyApi || isStaticAsset) && !hasRange;

    // ===== 生成缓存 Key =====
    // 对于 proxy 类接口，用完整 URL（含 query）；对于静态资源，去掉 query 降低碎片化
    const cacheKey = isProxyApi ? request.url : `${url.origin}${url.pathname}`;
    // R2 的 key 不能以 "/" 开头，需要处理一下
    const r2Key = generateR2Key(url);

    // ===== GET 请求：三级缓存查找 =====
    if (request.method === 'GET' && isCache) {
      // 🥇 第一层：检查边缘缓存 (最快)
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log(`[Cache Hit - Edge] ${cacheKey}`);
        return cachedResponse;
      }

      // 🥈 第二层：检查 R2 存储 (中速，但永久)
      try {
        const r2Object = await env.CACHE_BUCKET.get(r2Key);
        if (r2Object) {
          console.log(`[Cache Hit - R2] ${r2Key}`);

          // 从 R2 构建响应
          const headers = new Headers();
          r2Object.writeHttpMetadata(headers);
          headers.set('etag', r2Object.httpEtag);
          headers.set(
            'Cache-Control',
            'public, max-age=604800, s-maxage=604800',
          );
          // 添加自定义头标识来源
          headers.set('X-Cache-Source', 'R2');

          const response = new Response(r2Object.body, { headers });

          // 异步将 R2 数据写入边缘缓存，加速下次访问
          ctx.waitUntil(
            cache.put(cacheKey, response.clone()).catch((err) => {
              console.warn(`[Edge Cache Write Failed] ${err.message}`);
            }),
          );

          return response;
        }
      } catch (err) {
        console.warn(`[R2 Read Error] ${err.message}`);
        // R2 读取失败不阻塞，继续回源
      }
    }

    // ===== DELETE 请求：清除缓存 =====
    if (request.method === 'DELETE' && isCache) {
      const results = await Promise.allSettled([
        cache.delete(cacheKey),
        env.CACHE_BUCKET.delete(r2Key),
      ]);
      console.log(
        `[Cache Delete] Edge: ${results[0].status}, R2: ${results[1].status}`,
      );
      return new Response(JSON.stringify({ success: true, key: r2Key }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ===== 回源请求 =====
    const originalHost = url.hostname;
    const targetHostname = originalHost.replace(
      'dogegg.online',
      'dogegg.de5.net',
    );
    url.hostname = targetHostname;
    url.protocol = 'https:';

    try {
      const hasBody = !['GET', 'HEAD'].includes(request.method);
      const response = await fetch(
        new Request(url.toString(), {
          method: request.method,
          headers: request.headers,
          body: hasBody ? request.body : null,
          redirect: 'manual',
        }),
      );

      // ===== 处理重定向 =====
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        if (location) {
          const newLocation = location.replace(targetHostname, originalHost);
          console.log(`[Redirect Fix] ${location} -> ${newLocation}`);
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Location', newLocation);
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        }
      }

      // ===== 🥉 第三层：回源成功，写入双层缓存 =====
      if (response.status === 200 && request.method === 'GET' && isCache) {
        if (!response.body) {
          return response;
        }

        // 准备缓存头
        const headers = new Headers(response.headers);
        headers.delete('Pragma');
        headers.delete('Expires');
        headers.delete('Vary');
        headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        headers.set('X-Cache-Source', 'Origin');

        // 获取 Content-Type 用于 R2 存储
        const contentType =
          response.headers.get('Content-Type') || 'application/octet-stream';

        // ⚠️ 关键：需要 clone 多份，因为 body 流只能读取一次
        // 1. 返回给用户
        // 2. 写入 Edge Cache
        // 3. 写入 R2
        const [userStream, cacheStream] = response.body.tee();
        // tee() 只能分成两份，需要再 tee 一次
        const [cacheStreamFinal, r2StreamFinal] = cacheStream.tee();

        // 构建用于存储的响应
        const responseForCache = new Response(cacheStreamFinal, {
          status: response.status,
          statusText: response.statusText,
          headers: headers,
        });

        const contentLengthHeader = response.headers.get('Content-Length');
        const contentLength = contentLengthHeader
          ? Number(contentLengthHeader)
          : null;
        const canStreamToR2 =
          Number.isFinite(contentLength) && contentLength >= 0;

        const r2WriteTask = canStreamToR2
          ? withTimeout(
              (async () => {
                const fixedLength = new FixedLengthStream(contentLength);
                const uploadPromise = env.CACHE_BUCKET.put(
                  r2Key,
                  fixedLength.readable,
                  {
                    httpMetadata: {
                      contentType: contentType,
                    },
                    customMetadata: {
                      originalUrl: request.url,
                      cachedAt: new Date().toISOString(),
                    },
                    contentLength: contentLength,
                  },
                );
                const pipePromise = r2StreamFinal.pipeTo(fixedLength.writable);
                await Promise.all([uploadPromise, pipePromise]);
              })(),
              30000,
              'R2',
            )
          : Promise.resolve({
              skipped: true,
              reason: 'missing content-length',
            });

        // 异步写入双层缓存（带超时保护）
        ctx.waitUntil(
          Promise.allSettled([
            // 写入边缘缓存
            withTimeout(
              cache.put(cacheKey, responseForCache.clone()),
              10000, // 10秒超时
              'Edge Cache',
            ),
            // 写入 R2 持久存储
            r2WriteTask,
          ]).then((results) => {
            console.log(
              `[Cache Write] Edge: ${results[0].status}, R2: ${results[1].status}`,
            );
          }),
        );
        // 返回给用户
        return new Response(userStream, {
          status: response.status,
          statusText: response.statusText,
          headers: headers,
        });
      }

      return response;
    } catch (err) {
      console.error(`[Fetch Error] ${url.toString()}: ${err.message}`);
      return new Response('Worker Proxy Error: ' + err.message, {
        status: 502,
      });
    }
  },
};

// ===== 辅助函数 =====

/**
 * 生成 R2 存储的 Key
 * 将 URL 转换为合法的 R2 对象键
 */
function generateR2Key(url) {
  // 方案1：使用完整 URL 的 hash（适合 proxy 接口，URL 参数决定内容）
  // 方案2：使用 pathname（适合静态资源）

  if (url.pathname.includes('/api/')) {
    // 对于 API 代理，使用 URL hash 作为 key，避免特殊字符问题
    const encoder = new TextEncoder();
    const data = encoder.encode(url.href);
    // 简单的字符串 hash（生产环境建议用 SHA-256）
    let hash = 0;
    for (let i = 0; i < url.href.length; i++) {
      const char = url.href.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const hashStr = Math.abs(hash).toString(16);
    // 保留文件扩展名便于调试
    const ext = getExtension(url);
    return `api-cache/${hashStr}${ext}`;
  } else {
    // 静态资源直接用路径
    // 去掉开头的 /，R2 key 不能以 / 开头
    return `static${url.pathname}`;
  }
}

/**
 * 从 URL 提取文件扩展名
 */
function getExtension(url) {
  const match = url.pathname.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0] : '';
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}
