/**
 * Internal API for credential verification (used by NextAuth).
 * Performs database lookup via lib/db/postgres — not an external REST service.
 */

import { NextResponse } from 'next/server';
import { verifyCredentials } from '@lib/auth/verifyCredentials';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = body?.username ?? body?.email ?? '';
    const password = body?.password ?? '';
    const user = await verifyCredentials(username, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
