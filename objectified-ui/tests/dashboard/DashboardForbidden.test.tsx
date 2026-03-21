import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardForbidden from '../../src/app/dashboard/components/DashboardForbidden';
import { PERMISSION_DENIED_SUGGESTION } from '../../lib/api/permissionMessaging';

describe('DashboardForbidden', () => {
  it('shows default suggested action for permission issues', () => {
    render(<DashboardForbidden message="You cannot open this page." />);
    expect(screen.getByRole('alert')).toHaveTextContent(PERMISSION_DENIED_SUGGESTION);
  });

  it('hides suggested action when empty string is passed', () => {
    render(
      <DashboardForbidden message="No extra help." suggestedAction="" />
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(PERMISSION_DENIED_SUGGESTION);
  });
});
