/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

export function SonnerToaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const syncTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return <Toaster richColors position="top-center" theme={theme} />;
}
