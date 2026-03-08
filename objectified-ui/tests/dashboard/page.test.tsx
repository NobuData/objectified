import React from 'react';
import { render } from '@testing-library/react';
import { redirect } from 'next/navigation';
import DashboardPage from '../../src/app/dashboard/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /dashboard/profile', () => {
    try {
      render(<DashboardPage />);
    } catch {
      // Next.js redirect() throws when called
    }
    expect(redirect).toHaveBeenCalledWith('/dashboard/profile');
  });
});
