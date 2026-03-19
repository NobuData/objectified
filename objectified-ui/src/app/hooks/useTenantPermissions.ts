'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  getMyTenantPermissions,
  getRestClientOptions,
  type EffectivePermissionsResponse,
} from '@lib/api/rest-client';

export interface TenantPermissionsState {
  loading: boolean;
  error: string | null;
  permissions: EffectivePermissionsResponse | null;
  permissionKeys: Set<string>;
  has: (key: string) => boolean;
}

export function useTenantPermissions(tenantId: string | null | undefined): TenantPermissionsState {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermissionsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!tenantId || status !== 'authenticated' || !session) {
        setPermissions(null);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const opts = getRestClientOptions((session as { accessToken?: string } | null) ?? null);
        const res = await getMyTenantPermissions(tenantId, opts);
        if (!cancelled) setPermissions(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load permissions';
        if (!cancelled) {
          setPermissions(null);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [tenantId, status, session]);

  const permissionKeys = useMemo(() => {
    const keys = permissions?.permission_keys ?? [];
    return new Set(keys);
  }, [permissions]);

  const has = useMemo(() => (key: string) => permissionKeys.has(key), [permissionKeys]);

  return { loading, error, permissions, permissionKeys, has };
}

