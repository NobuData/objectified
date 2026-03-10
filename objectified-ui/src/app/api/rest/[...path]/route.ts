/**
 * Proxies requests to objectified-rest with session auth.
 * All dashboard and UI calls should use /api/rest/* so that only the server
 * talks to objectified-rest with the session token; no direct REST from client.
 */

import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@lib/auth/authOptions';

const REST_BASE =
  process.env.REST_API_BASE_URL ||
  process.env.NEXT_PUBLIC_REST_API_BASE_URL ||
  'http://localhost:8000/v1';

function buildBackendUrl(pathSegments: string[], request: NextRequest): string {
  const path = pathSegments.length ? `/${pathSegments.join('/')}` : '';
  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  const base = REST_BASE.replace(/\/$/, '');
  return query ? `${base}${path}?${query}` : `${base}${path}`;
}

function buildAuthHeaders(session: { accessToken: string }): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
  };
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function copyResponseHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP.has(lower)) {
      out[key] = value;
    }
  });
  return out;
}

async function proxyResponse(res: Response): Promise<NextResponse> {
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: copyResponseHeaders(res),
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const sessionWithToken = session as { accessToken?: string };
  if (!sessionWithToken.accessToken) {
    return NextResponse.json(
      { detail: 'Session token required for REST proxy' },
      { status: 403 }
    );
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders({ accessToken: sessionWithToken.accessToken });
  try {
    const res = await fetch(url, { method: 'GET', headers });
    return proxyResponse(res);
  } catch (err) {
    console.error('REST proxy GET error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const sessionWithToken = session as { accessToken?: string };
  if (!sessionWithToken.accessToken) {
    return NextResponse.json(
      { detail: 'Session token required for REST proxy' },
      { status: 403 }
    );
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders({ accessToken: sessionWithToken.accessToken });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body || undefined,
    });
    return proxyResponse(res);
  } catch (err) {
    console.error('REST proxy POST error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const sessionWithToken = session as { accessToken?: string };
  if (!sessionWithToken.accessToken) {
    return NextResponse.json(
      { detail: 'Session token required for REST proxy' },
      { status: 403 }
    );
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders({ accessToken: sessionWithToken.accessToken });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: body || undefined,
    });
    return proxyResponse(res);
  } catch (err) {
    console.error('REST proxy PUT error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const sessionWithToken = session as { accessToken?: string };
  if (!sessionWithToken.accessToken) {
    return NextResponse.json(
      { detail: 'Session token required for REST proxy' },
      { status: 403 }
    );
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders({ accessToken: sessionWithToken.accessToken });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: body || undefined,
    });
    return proxyResponse(res);
  } catch (err) {
    console.error('REST proxy PATCH error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const sessionWithToken = session as { accessToken?: string };
  if (!sessionWithToken.accessToken) {
    return NextResponse.json(
      { detail: 'Session token required for REST proxy' },
      { status: 403 }
    );
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders({ accessToken: sessionWithToken.accessToken });
  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    return proxyResponse(res);
  } catch (err) {
    console.error('REST proxy DELETE error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}
