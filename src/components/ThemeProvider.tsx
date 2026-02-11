'use client';

import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

import { applyTheme, getSavedTheme } from '@/lib/theme-config';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  React.useEffect(() => {
    // 初始化应用保存的主题色
    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);
  }, []);

  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme='system'
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
