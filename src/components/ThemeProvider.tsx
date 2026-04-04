'use client';

import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

import { applyTheme, getSavedTheme } from '@/lib/theme-config';

type AppThemeProviderProps = React.PropsWithChildren<ThemeProviderProps>;

const NextThemesProviderWithChildren =
  NextThemesProvider as React.ComponentType<AppThemeProviderProps>;

export function ThemeProvider({ children, ...props }: AppThemeProviderProps) {
  React.useEffect(() => {
    // 初始化应用保存的主题色
    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);
  }, []);

  return (
    <NextThemesProviderWithChildren
      attribute='class'
      defaultTheme='system'
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProviderWithChildren>
  );
}
