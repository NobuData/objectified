'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Loader2, Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import {
  createTenantSsoProvider,
  deleteTenantSsoProvider,
  getRestClientOptions,
  isForbiddenError,
  listTenantSsoProviders,
  updateTenantSsoProvider,
  type SsoProviderCreate,
  type SsoProviderSchema,
  type SsoProviderType,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export default function TenantSsoPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId;
  const { data: session, status } = useSession();
  const { confirm } = useDialog();

  type SessionUser = { is_administrator?: boolean };
  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const [providers, setProviders] = useState<SsoProviderSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listTenantSsoProviders(
        tenantId,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      setProviders(data);
    } catch (e) {
      setProviders([]);
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view SSO configuration for this tenant.'
          : e instanceof Error
            ? e.message
            : 'Failed to load SSO providers'
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, status, session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetchProviders();
  }, [status, fetchProviders]);

  const handleDelete = async (p: SsoProviderSchema) => {
    if (!tenantId || !session) return;
    const ok = await confirm({
      title: 'Delete SSO provider',
      message: (
        <span>
          Delete <strong>{p.name}</strong> ({p.provider_type})? This will soft-delete the provider.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeletingId(p.id);
    setError(null);
    try {
      await deleteTenantSsoProvider(
        tenantId,
        p.id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await fetchProviders();
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'Admin privileges required to delete an SSO provider.'
          : e instanceof Error
            ? e.message
            : 'Failed to delete SSO provider'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const providerCards = useMemo(() => {
    return providers.map((p) => (
      <ProviderCard
        key={p.id}
        provider={p}
        tenantId={tenantId}
        session={session}
        isAdministrator={isAdministrator}
        saving={savingId === p.id}
        deleting={deletingId === p.id}
        onSaveStart={() => setSavingId(p.id)}
        onSaveEnd={() => setSavingId(null)}
        onDelete={() => handleDelete(p)}
        onUpdated={fetchProviders}
        onError={setError}
      />
    ));
  }, [providers, tenantId, session, isAdministrator, savingId, deletingId, fetchProviders]);

  if (status === 'loading' || (status === 'authenticated' && loading && !error)) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">You must be signed in to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/tenants"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-200 text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Tenants
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Tenant SSO
          </h1>
        </div>

        {isAdministrator && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add provider
          </button>
        )}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-3xl">
        Configure optional enterprise SSO providers for this tenant. OIDC providers store the discovery document JSON,
        and SAML providers store the IdP metadata XML.
      </p>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {providers.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            No SSO providers configured for this tenant yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {providerCards}
        </div>
      )}

      <CreateProviderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
        session={session}
        onCreated={fetchProviders}
        onError={setError}
      />
    </div>
  );
}

interface ProviderCardProps {
  provider: SsoProviderSchema;
  tenantId: string;
  session: ReturnType<typeof useSession>['data'];
  isAdministrator: boolean;
  saving: boolean;
  deleting: boolean;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onDelete: () => void;
  onUpdated: () => void;
  onError: (msg: string | null) => void;
}

function ProviderCard({
  provider,
  tenantId,
  session,
  isAdministrator,
  saving,
  deleting,
  onSaveStart,
  onSaveEnd,
  onDelete,
  onUpdated,
  onError,
}: ProviderCardProps) {
  const [name, setName] = useState(provider.name);
  const [enabled, setEnabled] = useState(Boolean(provider.enabled));
  const [metadataJson, setMetadataJson] = useState(prettyJson(provider.metadata));
  const [docJson, setDocJson] = useState(
    provider.provider_type === 'oidc'
      ? prettyJson(provider.oidc_discovery)
      : provider.saml_metadata_xml ?? ''
  );
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setName(provider.name);
    setEnabled(Boolean(provider.enabled));
    setMetadataJson(prettyJson(provider.metadata));
    setDocJson(
      provider.provider_type === 'oidc'
        ? prettyJson(provider.oidc_discovery)
        : provider.saml_metadata_xml ?? ''
    );
    setParseError(null);
  }, [provider.name, provider.enabled, provider.metadata, provider.provider_type, provider.oidc_discovery, provider.saml_metadata_xml]);

  const typeLabel = provider.provider_type === 'oidc' ? 'OIDC (Discovery JSON)' : 'SAML (Metadata XML)';

  const handleSave = async () => {
    if (!isAdministrator || !session) return;
    onError(null);
    setParseError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setParseError('Name is required.');
      return;
    }

    let metadata: Record<string, unknown> | null = null;
    try {
      metadata = JSON.parse(metadataJson || '{}') as Record<string, unknown>;
    } catch {
      setParseError('Metadata must be valid JSON.');
      return;
    }

    const update: Record<string, unknown> = {
      name: trimmedName,
      enabled,
      metadata,
    };

    if (provider.provider_type === 'oidc') {
      let discovery: Record<string, unknown>;
      try {
        discovery = JSON.parse(docJson || '{}') as Record<string, unknown>;
      } catch {
        setParseError('OIDC discovery must be valid JSON.');
        return;
      }
      update.oidc_discovery = discovery;
    } else {
      const xml = docJson.trim();
      if (!xml) {
        setParseError('SAML metadata XML is required.');
        return;
      }
      update.saml_metadata_xml = xml;
    }

    onSaveStart();
    try {
      await updateTenantSsoProvider(
        tenantId,
        provider.id,
        update,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await onUpdated();
    } catch (e) {
      onError(
        isForbiddenError(e)
          ? 'Admin privileges required to update an SSO provider.'
          : e instanceof Error
            ? e.message
            : 'Failed to update SSO provider'
      );
    } finally {
      onSaveEnd();
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {provider.name}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {typeLabel}
          </div>
        </div>
        {isAdministrator && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            Delete
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor={`sso-name-${provider.id}`}>
              Name
            </Label.Root>
            <input
              id={`sso-name-${provider.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdministrator || saving}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`sso-enabled-${provider.id}`}
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!isAdministrator || saving}
              className="h-4 w-4"
            />
            <Label.Root
              className="text-sm text-slate-700 dark:text-slate-300"
              htmlFor={`sso-enabled-${provider.id}`}
            >
              Enabled
            </Label.Root>
          </div>

          <div className="space-y-2">
            <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor={`sso-meta-${provider.id}`}>
              Metadata (JSON)
            </Label.Root>
            <textarea
              id={`sso-meta-${provider.id}`}
              rows={6}
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              disabled={!isAdministrator || saving}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor={`sso-doc-${provider.id}`}>
            {provider.provider_type === 'oidc' ? 'OIDC discovery (JSON)' : 'SAML metadata (XML)'}
          </Label.Root>
          <textarea
            id={`sso-doc-${provider.id}`}
            rows={14}
            value={docJson}
            onChange={(e) => setDocJson(e.target.value)}
            disabled={!isAdministrator || saving}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-60"
          />

          {parseError && (
            <div className="text-xs text-red-700 dark:text-red-300" role="alert">
              {parseError}
            </div>
          )}

          {isAdministrator && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden />
                  Save
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface CreateProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  session: ReturnType<typeof useSession>['data'];
  onCreated: () => void;
  onError: (msg: string | null) => void;
}

function CreateProviderDialog({
  open,
  onOpenChange,
  tenantId,
  session,
  onCreated,
  onError,
}: CreateProviderDialogProps) {
  const [providerType, setProviderType] = useState<SsoProviderType>('oidc');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [metadataJson, setMetadataJson] = useState('{}');
  const [doc, setDoc] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setProviderType('oidc');
    setName('');
    setEnabled(true);
    setMetadataJson('{}');
    setDoc('{}');
    setFormError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    onError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(metadataJson || '{}') as Record<string, unknown>;
    } catch {
      setFormError('Metadata must be valid JSON.');
      return;
    }

    const body: SsoProviderCreate = {
      provider_type: providerType,
      name: trimmedName,
      enabled,
      metadata,
    };

    if (providerType === 'oidc') {
      try {
        body.oidc_discovery = JSON.parse(doc || '{}') as Record<string, unknown>;
      } catch {
        setFormError('OIDC discovery must be valid JSON.');
        return;
      }
    } else {
      const xml = doc.trim();
      if (!xml) {
        setFormError('SAML metadata XML is required.');
        return;
      }
      body.saml_metadata_xml = xml;
    }

    setSaving(true);
    try {
      await createTenantSsoProvider(
        tenantId,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      await onCreated();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'Admin privileges required to create an SSO provider.'
          : err instanceof Error
            ? err.message
            : 'Failed to create SSO provider'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => handleOpenChange(false)}
          onPointerDownOutside={() => handleOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Add SSO provider
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
                role="alert"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="sso-create-type">
                  Type
                </Label.Root>
                <select
                  id="sso-create-type"
                  value={providerType}
                  onChange={(e) => {
                    const next = e.target.value as SsoProviderType;
                    setProviderType(next);
                    setDoc(next === 'oidc' ? '{}' : '');
                  }}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="oidc">OIDC</option>
                  <option value="saml">SAML</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="sso-create-name">
                  Name
                </Label.Root>
                <input
                  id="sso-create-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={providerType === 'oidc' ? 'Okta' : 'AzureAD'}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="sso-create-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label.Root className="text-sm text-slate-700 dark:text-slate-300" htmlFor="sso-create-enabled">
                Enabled
              </Label.Root>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="sso-create-meta">
                  Metadata (JSON)
                </Label.Root>
                <textarea
                  id="sso-create-meta"
                  rows={8}
                  value={metadataJson}
                  onChange={(e) => setMetadataJson(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="sso-create-doc">
                  {providerType === 'oidc' ? 'OIDC discovery (JSON)' : 'SAML metadata (XML)'}
                </Label.Root>
                <textarea
                  id="sso-create-doc"
                  rows={8}
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden />
                    Create
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

