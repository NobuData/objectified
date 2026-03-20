import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  CliApiError,
  assertAuth,
  loadConfigFromEnv,
  openApiOptionsToQuery,
  pullVersion,
} from './client';

describe('openApiOptionsToQuery', () => {
  it('maps scalars and JSON fields', () => {
    const q = openApiOptionsToQuery({
      project_name: 'P',
      version: '1.0.0',
      description: 'D',
      servers: [{ url: 'https://a.com' }],
    });
    expect(q.project_name).toBe('P');
    expect(q.version).toBe('1.0.0');
    expect(q.description).toBe('D');
    expect(q.servers).toBe(JSON.stringify([{ url: 'https://a.com' }]));
  });
});

describe('assertAuth', () => {
  it('throws when no credentials', () => {
    expect(() => assertAuth({ baseUrl: 'http://x/v1' })).toThrow(CliApiError);
  });

  it('passes with api key', () => {
    expect(() => assertAuth({ baseUrl: 'http://x/v1', apiKey: 'k' })).not.toThrow();
  });
});

describe('loadConfigFromEnv', () => {
  afterEach(() => {
    delete process.env.OBJECTIFIED_API_URL;
    delete process.env.OBJECTIFIED_API_KEY;
    delete process.env.OBJECTIFIED_JWT;
  });

  it('normalizes base URL to include /v1', () => {
    process.env.OBJECTIFIED_API_URL = 'http://localhost:8000';
    process.env.OBJECTIFIED_API_KEY = 'secret';
    const cfg = loadConfigFromEnv();
    expect(cfg.baseUrl).toBe('http://localhost:8000/v1');
    expect(cfg.apiKey).toBe('secret');
  });
});

describe('pullVersion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GETs pull URL and parses JSON', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              version_id: 'vid',
              pulled_at: '2020-01-01T00:00:00Z',
              revision: 3,
            }),
        } as Response)
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const cfg = { baseUrl: 'http://x/v1', apiKey: 'k' };
    const r = await pullVersion(cfg, 'vid', { sinceRevision: 2 });
    expect(r.version_id).toBe('vid');
    expect(r.revision).toBe(3);
    expect(fetchMock.mock.calls.length).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/v1/versions/vid/pull?since_revision=2');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('k');
  });
});
