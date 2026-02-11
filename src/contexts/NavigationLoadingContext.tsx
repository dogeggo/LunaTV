'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

interface NavigationLoadingContextType {
  isNavigating: boolean;
  navigationTitle: string;
  startNavigation: (title?: string) => void;
  stopNavigation: () => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isNavigating: false,
  navigationTitle: '',
  startNavigation: () => {},
  stopNavigation: () => {},
});

export function NavigationLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationTitle, setNavigationTitle] = useState('');

  const startNavigation = useCallback((title?: string) => {
    setNavigationTitle(title || '');
    setIsNavigating(true);
  }, []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setNavigationTitle('');
  }, []);

  return (
    <NavigationLoadingContext.Provider
      value={{ isNavigating, navigationTitle, startNavigation, stopNavigation }}
    >
      {children}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}
