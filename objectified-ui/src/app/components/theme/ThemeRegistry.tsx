'use client';

import * as React from 'react';

/**
 * ThemeRegistry - passes through children.
 * The app uses next-themes and Tailwind dark mode.
 */
export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

