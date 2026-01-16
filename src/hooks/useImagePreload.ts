import { useEffect } from 'react';

/**
 * Hook to preload images for better UX
 *
 * Features:
 * - Preloads images using JS Image object to warm up the browser cache
 * - Global deduplication to avoid redundant preloads
 * - Incremental addition mode
 * - Prevents "preloaded but not used" browser warnings by avoiding <link rel="preload">
 *
 * Inspired by DecoTV's optimization
 */

// Global set of preloaded URLs (avoid duplicate preloads across all components)
const preloadedUrls = new Set<string>();

export function useImagePreload(imageUrls: string[], enabled = true) {
  // Incremental preload addition
  useEffect(() => {
    if (!enabled || !imageUrls.length) return;

    // Preload first few images
    const urlsToPreload = imageUrls.slice(0, Math.min(10, imageUrls.length));

    urlsToPreload.forEach((url) => {
      if (!url) return;

      // Clean and validate URL
      const cleanUrl = url.trim().replace(/["'>]/g, '');
      if (!cleanUrl) return;

      // Skip if already preloaded globally
      if (preloadedUrls.has(cleanUrl)) return;

      // Preload using JS Image object
      // This downloads the image to browser cache without triggering "unused preload" warnings
      const img = new Image();
      img.src = cleanUrl;

      // Mark as preloaded
      preloadedUrls.add(cleanUrl);
    });
  }, [imageUrls, enabled]);
}
