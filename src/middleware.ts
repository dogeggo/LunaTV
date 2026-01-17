/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = Math.random().toString(36).substring(7);

  // Generate CSP Nonce
  const nonce = btoa(crypto.randomUUID());

  // Create CSP header
  // Note: We allow chrome-extension: scheme for local development extensions
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval' chrome-extension:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    media-src 'self' blob: data: https: http:;
    font-src 'self' data:;
    connect-src 'self' https: http:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  let response: NextResponse;

  // 处理 /adult/ 路径前缀，重写为实际 API 路径
  if (pathname.startsWith('/adult/')) {
    // 移除 /adult 前缀
    const newPathname = pathname.replace(/^\/adult/, '');
    // 创建新的 URL
    const url = request.nextUrl.clone();
    url.pathname = newPathname || '/';
    // 添加 adult=1 参数（如果还没有）
    if (!url.searchParams.has('adult')) {
      url.searchParams.set('adult', '1');
    }

    // 重写请求
    // We create a rewrite response but we need to ensure request headers are passed if we continue?
    // Actually rewrite() takes options too? No, only url.
    // But we can return a rewrite response.

    // For rewrite, we want to modify the request headers sent to the destination?
    // NextResponse.rewrite(url, { request: { headers } })
    response = NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });

    // 设置响应头标识成人内容模式
    response.headers.set('X-Content-Mode', 'adult');

    // 继续执行认证检查（对于 API 路径）
    if (newPathname.startsWith('/api')) {
      // 将重写后的请求传递给认证逻辑
      const modifiedRequest = new NextRequest(url, request);
      // We pass the response we already created so handleAuthentication can use it or chain from it
      // But handleAuthentication creates its own response usually.
      // We need to pass requestHeaders to handleAuthentication
      response = await handleAuthentication(
        modifiedRequest,
        newPathname,
        requestId,
        requestHeaders, // Pass headers
        response,
      );
    }
  } else if (shouldSkipAuth(pathname)) {
    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } else {
    response = await handleAuthentication(
      request,
      pathname,
      requestId,
      requestHeaders,
    );
  }

  // Set CSP header on the response
  response.headers.set('Content-Security-Policy', cspHeader);

  return response;
}

// 提取认证处理逻辑为单独的函数
async function handleAuthentication(
  request: NextRequest,
  pathname: string,
  requestId: string,
  requestHeaders: Headers,
  response?: NextResponse,
) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (!process.env.PASSWORD) {
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return NextResponse.redirect(warningUrl);
  }

  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo) {
    console.log(`[Middleware ${requestId}] No auth info, failing auth`);
    return handleAuthFailure(request, pathname);
  }

  // localstorage模式：在middleware中完成验证
  if (storageType === 'localstorage') {
    if (!authInfo.password || authInfo.password !== process.env.PASSWORD) {
      return handleAuthFailure(request, pathname);
    }
    return (
      response ||
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    );
  }

  // 其他模式：只验证签名
  // 检查是否有用户名（非localStorage模式下密码不存储在cookie中）
  if (!authInfo.username || !authInfo.signature) {
    console.log(`[Middleware ${requestId}] Missing username or signature:`, {
      hasUsername: !!authInfo.username,
      hasSignature: !!authInfo.signature,
    });
    return handleAuthFailure(request, pathname);
  }

  // 验证签名（如果存在）
  if (authInfo.signature) {
    const isValidSignature = await verifySignature(
      authInfo.username,
      authInfo.signature,
      process.env.PASSWORD || '',
    );

    // 签名验证通过即可
    if (isValidSignature) {
      return (
        response ||
        NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        })
      );
    }
  }
  // 签名验证失败或不存在签名
  console.log(
    `[Middleware ${requestId}] Signature verification failed, denying access`,
  );
  return handleAuthFailure(request, pathname);
}

// 验证签名
async function verifySignature(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    // 导入密钥
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // 将十六进制字符串转换为Uint8Array
    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );

    // 验证签名
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData,
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string,
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
    '/api/telegram/', // Telegram API 端点
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|register|oidc-register|warning|api/login|api/register|api/logout|api/cron|api/server-config|api/tvbox|api/live/merged|api/parse|api/bing-wallpaper|api/proxy/|api/telegram/|api/auth/oidc/).*)',
  ],
};
