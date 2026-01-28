'use client';

import { useEffect } from 'react';

import { initCacheCleaner } from '@/lib/cache';

export default function CacheCleaner() {
  useEffect(() => {
    void initCacheCleaner();
  }, []);

  return null;
}
