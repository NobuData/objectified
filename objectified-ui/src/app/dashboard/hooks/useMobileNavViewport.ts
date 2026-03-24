'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind `md` starts at 768px; mobile nav drawer uses `md:hidden`. */
const MOBILE_NAV_MEDIA_QUERY = '(max-width: 767px)';

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(MOBILE_NAV_MEDIA_QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_NAV_MEDIA_QUERY).matches;
}

/** SSR / first paint: assume desktop so the mobile dialog cannot block the layout. */
function getServerSnapshot() {
  return false;
}

export function useMobileNavViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
