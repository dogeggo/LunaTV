import { createHash } from 'crypto';

import { db } from '@/lib/db';
import {
  getRandomUserAgentWithInfo,
  getSecChUaHeaders,
} from '@/lib/user-agent';

export type DoubanSubjectFetchOptions = {
  cacheTtlMs?: number;
  maxEntries?: number; // Deprecated, kept for compatibility
  timeoutMs?: number;
  minRequestIntervalMs?: number;
  randomDelayMs?: [number, number];
  headers?: Record<string, string>;
};

export class DoubanSubjectFetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'DoubanSubjectFetchError';
  }
}

const CACHE_PREFIX = 'douban:subject:';
const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1000;
const DEFAULT_RANDOM_DELAY_RANGE: [number, number] = [300, 1000];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

type DoubanChallenge = {
  tok: string;
  cha: string;
  red: string;
  action?: string;
};

export class DoubanSubjectPageScraper {
  private static inflight = new Map<string, Promise<string>>();
  private static lastRequestTime = 0;

  static async getHtml(
    id: string,
    options: DoubanSubjectFetchOptions = {},
  ): Promise<string> {
    const cacheKey = CACHE_PREFIX + id.trim();

    const cachedHtml = await db.getCache(cacheKey);
    if (cachedHtml && typeof cachedHtml === 'string') {
      return cachedHtml;
    }

    const inflight = this.inflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = this.fetchAndCache(id, options).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, promise);
    return promise;
  }

  private static async fetchAndCache(
    id: string,
    options: DoubanSubjectFetchOptions,
  ): Promise<string> {
    const html = await this.fetchHtml(id, options);

    const ttlSeconds = options.cacheTtlMs
      ? Math.floor(options.cacheTtlMs / 1000)
      : DEFAULT_CACHE_TTL_SECONDS;

    if (ttlSeconds > 0) {
      const cacheKey = CACHE_PREFIX + id.trim();
      await db.setCache(cacheKey, html, ttlSeconds);
    }
    return html;
  }

  private static async fetchHtml(
    id: string,
    options: DoubanSubjectFetchOptions,
  ): Promise<string> {
    const minInterval =
      options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    const [minDelay, maxDelay] =
      options.randomDelayMs ?? DEFAULT_RANDOM_DELAY_RANGE;

    if (minInterval > 0) {
      const now = Date.now();
      const delta = now - this.lastRequestTime;
      if (delta < minInterval) {
        await new Promise((resolve) =>
          setTimeout(resolve, minInterval - delta),
        );
      }
      this.lastRequestTime = Date.now();
    }

    await randomDelay(minDelay, maxDelay);

    const sanitizedId = id.replace(/\/+$/, '');
    const target = `https://movie.douban.com/subject/${sanitizedId}/`;
    const { ua, browser, platform } = getRandomUserAgentWithInfo();
    const secChHeaders = getSecChUaHeaders(browser, platform);
    const headers: Record<string, string> = {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      DNT: '1',
      ...secChHeaders,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': ua,
      Referer: 'https://movie.douban.com/',
      Origin: 'https://movie.douban.com',
      ...(options.headers ?? {}),
    };

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let response = await fetchWithTimeout(
      target,
      {
        headers,
        redirect: 'manual',
      },
      timeoutMs,
    );
    let currentUrl = target;
    const cookieJar = new Map<string, string>();
    applySetCookies(cookieJar, getSetCookieHeaders(response.headers));

    for (
      let redirectCount = 0;
      redirectCount < MAX_REDIRECTS && REDIRECT_STATUSES.has(response.status);
      redirectCount += 1
    ) {
      const location = response.headers.get('location');
      if (!location) break;
      const nextUrl = new URL(location, currentUrl).toString();
      const redirectHeaders: Record<string, string> = {
        ...headers,
        Referer: currentUrl,
      };
      const cookieHeader = buildCookieHeader(cookieJar);
      if (cookieHeader) {
        redirectHeaders['Cookie'] = cookieHeader;
      }
      response = await fetchWithTimeout(
        nextUrl,
        {
          headers: redirectHeaders,
          redirect: 'manual',
        },
        timeoutMs,
      );
      applySetCookies(cookieJar, getSetCookieHeaders(response.headers));
      currentUrl = nextUrl;
    }

    const html = await response.text();
    const hasChallenge = parseDoubanChallenge(html) !== null;

    if (!response.ok && !hasChallenge) {
      throw new DoubanSubjectFetchError(
        `Douban subject request failed: ${response.status}`,
        response.status,
      );
    }

    return resolveDoubanChallenge({
      html,
      url: currentUrl,
      headers,
      responseHeaders: response.headers,
      cookieJar,
    });
  }
}

function randomDelay(min = 0, max = 0): Promise<void> {
  if (min <= 0 && max <= 0) return Promise.resolve();
  const safeMin = Math.max(0, min);
  const safeMax = Math.max(safeMin, max);
  const delay = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function parseDoubanChallenge(html: string): DoubanChallenge | null {
  const tok = findInputValue(html, 'tok');
  const cha = findInputValue(html, 'cha');
  const red = findInputValue(html, 'red');
  if (!tok || !cha || !red) {
    return null;
  }
  return {
    tok,
    cha,
    red,
    action: findFormAction(html),
  };
}

function findFormAction(html: string): string | undefined {
  const forms = html.match(/<form\b[^>]*>/gi) ?? [];
  for (const form of forms) {
    const attrs = parseAttributes(form);
    const id = attrs.id?.toLowerCase();
    const name = attrs.name?.toLowerCase();
    if (attrs.action && (id === 'sec' || name === 'sec')) {
      return attrs.action;
    }
  }
  for (const form of forms) {
    const attrs = parseAttributes(form);
    if (attrs.action) return attrs.action;
  }
  return undefined;
}

function findInputValue(html: string, key: string): string | null {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const target = key.toLowerCase();
  for (const input of inputs) {
    const attrs = parseAttributes(input);
    const name = (attrs.name ?? attrs.id ?? '').toLowerCase();
    if (name === target) {
      return attrs.value ?? null;
    }
  }
  return null;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z0-9:_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=[^;,]+=)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const customGetter = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof customGetter === 'function') {
    return customGetter.call(headers);
  }
  const header = headers.get('set-cookie');
  return header ? splitSetCookieHeader(header) : [];
}

function applySetCookies(
  cookieJar: Map<string, string>,
  setCookies: string[],
): void {
  for (const setCookie of setCookies) {
    const pair = setCookie.split(';')[0]?.trim();
    if (!pair) continue;
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex <= 0) continue;
    const name = pair.slice(0, equalsIndex).trim();
    const value = pair.slice(equalsIndex + 1).trim();
    if (name) {
      cookieJar.set(name, value);
    }
  }
}

function buildCookieHeader(cookieJar: Map<string, string>): string {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      normalized[key] = value;
    });
    return normalized;
  }
  return { ...(headers as Record<string, string>) };
}

function sha512Hex(value: string): string {
  return createHash('sha512').update(value).digest('hex');
}

function solveDoubanChallenge(
  cha: string,
  difficulty = 4,
  maxNonce = 2_000_000,
): number {
  const targetPrefix = '0'.repeat(difficulty);
  for (let nonce = 1; nonce <= maxNonce; nonce += 1) {
    const hash = sha512Hex(`${cha}${nonce}`);
    if (hash.startsWith(targetPrefix)) {
      return nonce;
    }
  }
  throw new DoubanSubjectFetchError('Douban challenge solve failed', 403);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { signal: _ignored, ...rest } = options;
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveDoubanChallenge(params: {
  html: string;
  url: string;
  headers?: HeadersInit;
  responseHeaders: Headers;
  cookieJar?: Map<string, string>;
}): Promise<string> {
  let html = params.html;
  const baseHeaders = normalizeHeaders(params.headers);
  const cookieJar = new Map<string, string>(params.cookieJar ?? []);
  applySetCookies(cookieJar, getSetCookieHeaders(params.responseHeaders));

  const pageOrigin = new URL(params.url).origin;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const challenge = parseDoubanChallenge(html);
    if (!challenge) {
      return html;
    }

    const nonce = solveDoubanChallenge(challenge.cha);
    const postBody = new URLSearchParams({
      tok: challenge.tok,
      cha: challenge.cha,
      sol: nonce.toString(),
      red: challenge.red,
    });

    let actionUrl = '';
    try {
      actionUrl = new URL(challenge.action || '/c', params.url).toString();
    } catch {
      actionUrl = new URL('/c', params.url).toString();
    }
    const postCandidates = [actionUrl];
    if (!postCandidates.includes('https://movie.douban.com/c')) {
      postCandidates.push('https://movie.douban.com/c');
    }
    if (!postCandidates.includes('https://www.douban.com/c')) {
      postCandidates.push('https://www.douban.com/c');
    }

    let postResponse: Response | null = null;
    let postUrl = actionUrl;
    for (const candidate of postCandidates) {
      postUrl = candidate;
      const postHeaders: Record<string, string> = {
        ...baseHeaders,
        Origin: pageOrigin,
        Referer: params.url,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      const initialCookie = buildCookieHeader(cookieJar);
      if (initialCookie) {
        postHeaders['Cookie'] = initialCookie;
      }

      postResponse = await fetchWithTimeout(
        candidate,
        {
          method: 'POST',
          headers: postHeaders,
          body: postBody,
          redirect: 'manual',
        },
        15000,
      );
      if (postResponse.status !== 404) {
        break;
      }
    }

    if (
      !postResponse ||
      postResponse.status < 200 ||
      postResponse.status >= 400
    ) {
      const status = postResponse?.status ?? 0;
      throw new DoubanSubjectFetchError(
        `Douban challenge submit failed: ${status}`,
        status || undefined,
      );
    }

    applySetCookies(cookieJar, getSetCookieHeaders(postResponse.headers));
    const location = postResponse.headers.get('location');
    const redirectTarget = location || challenge.red;
    const redirectUrl = new URL(redirectTarget, postUrl).toString();

    const finalHeaders: Record<string, string> = {
      ...baseHeaders,
      Referer: params.url,
    };
    const finalCookie = buildCookieHeader(cookieJar);
    if (finalCookie) {
      finalHeaders['Cookie'] = finalCookie;
    }

    const finalResponse = await fetchWithTimeout(
      redirectUrl,
      { headers: finalHeaders },
      15000,
    );
    const finalHtml = await finalResponse.text();
    const finalHasChallenge = parseDoubanChallenge(finalHtml) !== null;
    if (!finalResponse.ok && !finalHasChallenge) {
      throw new DoubanSubjectFetchError(
        `Douban challenge follow-up failed: ${finalResponse.status}`,
        finalResponse.status,
      );
    }

    applySetCookies(cookieJar, getSetCookieHeaders(finalResponse.headers));
    html = finalHtml;
  }

  throw new DoubanSubjectFetchError(
    'Douban challenge not resolved after retries',
    403,
  );
}
