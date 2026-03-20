'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';
import { UserAppearanceProvider } from '@/app/contexts/UserAppearanceContext';

const SessionWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <UserAppearanceProvider>{children}</UserAppearanceProvider>
    </SessionProvider>
  );
};

export default SessionWrapper;

