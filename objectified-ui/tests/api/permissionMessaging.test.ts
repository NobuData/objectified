import { formatForbiddenAlertMessage } from '../../lib/api/permissionMessaging';
import { RestApiError } from '../../lib/api/rest-client';

describe('permissionMessaging', () => {
  it('formatForbiddenAlertMessage uses API detail when specific', () => {
    const msg = formatForbiddenAlertMessage(
      new RestApiError('Custom policy violation', 403),
      'fallback'
    );
    expect(msg).toContain('Custom policy violation');
    expect(msg).toContain('tenant administrator');
  });

  it('formatForbiddenAlertMessage uses fallback for generic 403 text', () => {
    const msg = formatForbiddenAlertMessage(new RestApiError('Forbidden', 403), 'Cannot save.');
    expect(msg).toContain('Cannot save.');
    expect(msg).toContain('tenant administrator');
  });
});
