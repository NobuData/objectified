import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import { getAccountByEmail, verifyCredentials } from '@lib/auth/verifyCredentials';

/**
 * Internal credential check used by the credentials provider.
 * Kept in auth layer so verification stays server-side and within NextAuth's CSRF flow.
 */
export async function authorizeCredentials(
  email: string,
  password: string
): Promise<{ id: string; name: string; email: string } | null> {
  try {
    const user = await verifyCredentials(email, password);
    return user ?? null;
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
        const dbAccount = await getAccountByEmail(email);
        if (!dbAccount) {
          return false;
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = token.sub ?? undefined;
      }
      return session;
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.sub = user.id;
      }
      if (account?.provider === 'github' && profile) {
        const email =
          (profile as { email?: string })?.email ??
          (profile as { emails?: { value: string }[] })?.emails?.[0]?.value;
        if (email) {
          const dbAccount = await getAccountByEmail(email);
          if (dbAccount) {
            token.sub = dbAccount.id;
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

