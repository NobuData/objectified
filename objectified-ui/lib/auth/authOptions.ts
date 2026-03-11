import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import { getAccountByEmail, verifyCredentials } from '@lib/auth/verifyCredentials';

/**
 * Internal credential check used by the credentials provider.
 * Kept in auth layer so verification stays server-side and within NextAuth's CSRF flow.
 * When REST API is available, also fetches an access token for profile/me endpoints.
 */
export async function authorizeCredentials(
  email: string,
  password: string
): Promise<{ id: string; name: string; email: string; accessToken?: string } | null> {
  try {
    const user = await verifyCredentials(email, password);
    if (!user) return null;

    const baseUrl =
      process.env.NEXT_PUBLIC_REST_API_BASE_URL ?? 'http://localhost:8000/v1';
    try {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as { access_token?: string };
        return {
          ...user,
          accessToken: data.access_token,
        };
      }
    } catch {
      // REST unavailable or login failed; still allow sign-in, profile edit may be limited
    }
    return user;
  } catch {
    return null;
  }
}

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }
      return authorizeCredentials(credentials.email, credentials.password);
    },
  }),
  ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
    ? [
        GitHubProvider({
          clientId: process.env.GITHUB_ID,
          clientSecret: process.env.GITHUB_SECRET,
        }),
      ]
    : []),
];

export const authOptions: NextAuthOptions = {
  providers,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'github') {
        const email =
          (profile as { email?: string })?.email ??
          (profile as { emails?: { value: string }[] })?.emails?.[0]?.value;
        if (!email) {
          return false;
        }
        try {
          const dbAccount = await getAccountByEmail(email);
          if (!dbAccount) {
            return false;
          }
        } catch {
          return false;
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = token.sub ?? undefined;
        (session as { accessToken?: string }).accessToken = token.accessToken as
          | string
          | undefined;
        (session.user as { is_administrator?: boolean }).is_administrator = (
          token as { is_administrator?: boolean }
        ).is_administrator ?? false;
      }
      return session;
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.sub = user.id;
        if ('accessToken' in user && typeof (user as { accessToken?: string }).accessToken === 'string') {
          token.accessToken = (user as { accessToken: string }).accessToken;
          // Resolve admin status by calling an admin-only endpoint; one-time at login.
          const baseUrl =
            process.env.NEXT_PUBLIC_REST_API_BASE_URL ?? 'http://localhost:8000/v1';
          try {
            const res = await fetch(`${baseUrl}/users`, {
              method: 'HEAD',
              headers: {
                Authorization: `Bearer ${(user as { accessToken: string }).accessToken}`,
                'Content-Type': 'application/json',
              },
            });
            (token as { is_administrator?: boolean }).is_administrator = res.ok;
          } catch {
            (token as { is_administrator?: boolean }).is_administrator = false;
          }
        } else {
          (token as { is_administrator?: boolean }).is_administrator = false;
        }
      }
      if (account?.provider === 'github' && profile) {
        const email =
          (profile as { email?: string })?.email ??
          (profile as { emails?: { value: string }[] })?.emails?.[0]?.value;
        if (email) {
          try {
            const dbAccount = await getAccountByEmail(email);
            if (dbAccount) {
              token.sub = dbAccount.id;
            }
          } catch {
            // Leave token.sub unchanged on DB failure
          }
        }
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
};

