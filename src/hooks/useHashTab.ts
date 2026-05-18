import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny hash-based router. The active tab is mirrored to `window.location.hash`
 * so the browser back/forward buttons feel natural; selecting a tab pushes a
 * new history entry.
 */
export function useHashTab<T extends string>(tabs: readonly T[], defaultTab: T): [T, (tab: T) => void] {
  const readFromHash = useCallback((): T => {
    if (typeof window === 'undefined') return defaultTab;
    const fromHash = window.location.hash.replace(/^#/, '') as T;
    return tabs.includes(fromHash) ? fromHash : defaultTab;
  }, [tabs, defaultTab]);

  const [activeTab, setActiveTab] = useState<T>(() => readFromHash());

  // Track the latest active tab in a ref so the setter can be stable while
  // still seeing the current value synchronously.
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const onPop = () => {
      const next = readFromHash();
      activeTabRef.current = next;
      setActiveTab(next);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, [readFromHash]);

  const goToTab = useCallback((tab: T) => {
    if (activeTabRef.current === tab) return;
    activeTabRef.current = tab;
    const url = `${window.location.pathname}${window.location.search}#${tab}`;
    window.history.pushState({ tab }, '', url);
    setActiveTab(tab);
  }, []);

  return [activeTab, goToTab];
}
