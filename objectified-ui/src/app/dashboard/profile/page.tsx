'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import { Flex, Text } from '@radix-ui/themes';
import { getMe, updateMe, type MeProfile } from '@lib/api/rest-client';
import { useUserAppearanceOptional } from '@/app/contexts/UserAppearanceContext';

export default function ProfilePage() {
  const appearance = useUserAppearanceOptional();
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const { status } = useSession();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (status === 'unauthenticated') {
      setLoading(false);
      return;
    }
    if (status !== 'authenticated') return;
    setError(null);
    try {
      const data = await getMe();
      setProfile(data);
      appearanceRef.current?.ingestServerMetadata(data.metadata ?? {});
      setName(data.name);
      setMetadataJson(
        JSON.stringify(data.metadata ?? {}, null, 2)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [status, fetchProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== 'authenticated') return;
    let parsedMetadata: Record<string, unknown>;
    try {
      parsedMetadata = JSON.parse(metadataJson) as Record<string, unknown>;
    } catch {
      setMetadataError('Invalid JSON');
      return;
    }
    setMetadataError(null);
    setSaveSuccess(false);
    setSaving(true);
    setError(null);
    try {
      const data = await updateMe(
        { name: name.trim() || undefined, metadata: parsedMetadata }
      );
      setProfile(data);
      appearance?.ingestServerMetadata(data.metadata ?? {});
      setMetadataJson(JSON.stringify(data.metadata ?? {}, null, 2));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || (status === 'authenticated' && loading && !error)) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">You must be signed in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">
        Profile
      </h1>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {saveSuccess && (
        <div
          className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm"
          role="status"
        >
          Profile saved.
        </div>
      )}

      {profile && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label.Root
              htmlFor="profile-name"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Name
            </Label.Root>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Your name"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label.Root
              htmlFor="profile-email"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Email (read-only)
            </Label.Root>
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-sm cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <Label.Root
              htmlFor="profile-metadata"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Metadata (JSON)
            </Label.Root>
            <textarea
              id="profile-metadata"
              rows={8}
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder='{"key": "value"}'
              disabled={saving}
            />
            {metadataError && (
              <Text size="1" color="red">{metadataError}</Text>
            )}
          </div>

          <Flex gap="2" align="center">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" aria-hidden />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </Flex>
        </form>
      )}

      {profile && (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
            Account details
          </h2>
          <dl className="text-sm space-y-1 text-slate-600 dark:text-slate-300">
            <div>
              <dt className="inline font-medium">ID: </dt>
              <dd className="inline font-mono">{profile.id}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Created: </dt>
              <dd className="inline">{profile.created_at ? new Date(profile.created_at).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Updated: </dt>
              <dd className="inline">{profile.updated_at ? new Date(profile.updated_at).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
