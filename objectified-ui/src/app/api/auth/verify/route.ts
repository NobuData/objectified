/**
 * Internal API for credential verification (used by NextAuth).
 * Performs database lookup via lib/db/postgres — not an external REST service.
 */

import { NextResponse } from 'next/server';
import { verifyCredentials } from '@lib/auth/verifyCredentials';

export async function POST(request: Request) {
  let body: { username?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
  }

  const username = body?.username ?? body?.email ?? '';
  const password = body?.password ?? '';

  if (!username.trim() || !password) {
    return NextResponse.json(
      { error: 'Missing required fields: username or email, and password' },
      { status: 400 }
    );
  }

  try {
    const user = await verifyCredentials(username, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
