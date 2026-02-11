export const THEME_PRESETS = {
  emerald: {
    name: '翡翠绿 (默认)',
    colors: {
      '--color-primary-50': '#ecfdf5',
      '--color-primary-100': '#d1fae5',
      '--color-primary-200': '#a7f3d0',
      '--color-primary-300': '#6ee7b7',
      '--color-primary-400': '#34d399',
      '--color-primary-500': '#10b981',
      '--color-primary-600': '#059669',
      '--color-primary-700': '#047857',
      '--color-primary-800': '#065f46',
      '--color-primary-900': '#064e3b',
      '--color-primary-950': '#022c22',
    },
  },
  blue: {
    name: '天空蓝',
    colors: {
      '--color-primary-50': '#eff6ff',
      '--color-primary-100': '#dbeafe',
      '--color-primary-200': '#bfdbfe',
      '--color-primary-300': '#93c5fd',
      '--color-primary-400': '#60a5fa',
      '--color-primary-500': '#3b82f6',
      '--color-primary-600': '#2563eb',
      '--color-primary-700': '#1d4ed8',
      '--color-primary-800': '#1e40af',
      '--color-primary-900': '#1e3a8a',
      '--color-primary-950': '#172554',
    },
  },
  purple: {
    name: '罗兰紫',
    colors: {
      '--color-primary-50': '#faf5ff',
      '--color-primary-100': '#f3e8ff',
      '--color-primary-200': '#e9d5ff',
      '--color-primary-300': '#d8b4fe',
      '--color-primary-400': '#c084fc',
      '--color-primary-500': '#a855f7',
      '--color-primary-600': '#9333ea',
      '--color-primary-700': '#7e22ce',
      '--color-primary-800': '#6b21a8',
      '--color-primary-900': '#581c87',
      '--color-primary-950': '#3b0764',
    },
  },
  orange: {
    name: '活力橙',
    colors: {
      '--color-primary-50': '#fff7ed',
      '--color-primary-100': '#ffedd5',
      '--color-primary-200': '#fed7aa',
      '--color-primary-300': '#fdba74',
      '--color-primary-400': '#fb923c',
      '--color-primary-500': '#f97316',
      '--color-primary-600': '#ea580c',
      '--color-primary-700': '#c2410c',
      '--color-primary-800': '#9a3412',
      '--color-primary-900': '#7c2d12',
      '--color-primary-950': '#431407',
    },
  },
  rose: {
    name: '玫瑰红',
    colors: {
      '--color-primary-50': '#fff1f2',
      '--color-primary-100': '#ffe4e6',
      '--color-primary-200': '#fecdd3',
      '--color-primary-300': '#fda4af',
      '--color-primary-400': '#fb7185',
      '--color-primary-500': '#f43f5e',
      '--color-primary-600': '#e11d48',
      '--color-primary-700': '#be123c',
      '--color-primary-800': '#9f1239',
      '--color-primary-900': '#881337',
      '--color-primary-950': '#4c0519',
    },
  },
};

export type ThemePreset = keyof typeof THEME_PRESETS;

export function applyTheme(theme: ThemePreset) {
  if (typeof window === 'undefined') return;

  const colors = THEME_PRESETS[theme]?.colors;
  if (!colors) return;

  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  localStorage.setItem('theme-color', theme);
}

export function getSavedTheme(): ThemePreset {
  if (typeof window === 'undefined') return 'emerald';
  return (localStorage.getItem('theme-color') as ThemePreset) || 'emerald';
}
