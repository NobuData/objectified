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

function buildAuthHeaders(session: { accessToken?: string } | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  const apiKey = process.env.REST_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders(session as { accessToken?: string });
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
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
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders(session as { accessToken?: string });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body || undefined,
    });
    const resText = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(resText, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
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
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders(session as { accessToken?: string });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: body || undefined,
    });
    const resText = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(resText, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
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
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders(session as { accessToken?: string });
  const body = await request.text();
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: body || undefined,
    });
    const resText = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(resText, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
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
  const { path } = await context.params;
  const url = buildBackendUrl(path, request);
  const headers = buildAuthHeaders(session as { accessToken?: string });
  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    const resText = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(resText, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('REST proxy DELETE error:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 502 }
    );
  }
}
