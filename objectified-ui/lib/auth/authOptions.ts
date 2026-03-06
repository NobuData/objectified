import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyCredentials } from '@lib/auth/verifyCredentials';

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

export const authOptions: NextAuthOptions = {
  providers: [
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
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
};

