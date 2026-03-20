import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as clientModule from './client';
import * as ioModule from './io';
import { buildProgram } from './cli';

// Mock child_process so spawnSync is injectable
jest.mock('child_process');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawnSync: mockedSpawnSync } = require('child_process') as { spawnSync: jest.Mock };

// ─── helpers ────────────────────────────────────────────────────────────────

function runArgv(...args: string[]) {
  return ['node', 'objectified', ...args];
}

async function parseProgram(argv: string[]) {
  const program = buildProgram();
  // exitOverride prevents commander from calling process.exit on errors
  program.exitOverride();
  try {
    await program.parseAsync(argv);
  } catch {
    // Swallow commander's CommanderError (e.g. missing required options)
  }
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('pull command', () => {
  let pullSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    pullSpy = jest
      .spyOn(clientModule, 'pullVersion')
      .mockResolvedValue({
        version_id: 'vid',
        pulled_at: '2020-01-01T00:00:00Z',
      } as clientModule.VersionPullResponse);
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls pullVersion with versionId and writes to stdout', async () => {
    process.env.OBJECTIFIED_API_KEY = 'testkey';
    await parseProgram(runArgv('pull', 'vid'));
    expect(pullSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'testkey' }),
      'vid',
      { revision: undefined, sinceRevision: undefined }
    );
    expect(writeJsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ version_id: 'vid' }),
      undefined // stdout
    );
    delete process.env.OBJECTIFIED_API_KEY;
  });

  it('passes --revision and --since-revision options', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('pull', 'vid', '--revision', '5', '--since-revision', '3'));
    expect(pullSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid',
      { revision: 5, sinceRevision: 3 }
    );
    delete process.env.OBJECTIFIED_API_KEY;
  });

  it('applies --api-url override, normalizing /v1 suffix', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('pull', 'vid', '--api-url', 'https://override.example.com'));
    expect(pullSpy).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://override.example.com/v1' }),
      'vid',
      expect.anything()
    );
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('push command', () => {
  let pushSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    pushSpy = jest
      .spyOn(clientModule, 'pushVersion')
      .mockResolvedValue({
        revision: 2,
        snapshot_id: 'snap',
        version_id: 'vid',
        committed_at: '2020-01-01T00:00:00Z',
      });
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls pushVersion with source and target', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('push', 'src-vid', '--target', 'tgt-vid'));
    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'src-vid',
      'tgt-vid',
      {}
    );
    expect(writeJsonSpy).toHaveBeenCalled();
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('export openapi command', () => {
  let exportSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exportSpy = jest
      .spyOn(clientModule, 'exportOpenApiDocument')
      .mockResolvedValue({ openapi: '3.1.0' });
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls exportOpenApiDocument and writes to stdout', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('export', 'openapi', 'vid'));
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid',
      {}
    );
    expect(writeJsonSpy).toHaveBeenCalledWith({ openapi: '3.1.0' }, undefined);
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('export jsonschema command', () => {
  let exportSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exportSpy = jest
      .spyOn(clientModule, 'exportJsonSchemaDocument')
      .mockResolvedValue({ $schema: 'https://json-schema.org/draft/2020-12/schema' });
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls exportJsonSchemaDocument with options', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(
      runArgv('export', 'jsonschema', 'vid', '--class-id', 'cid', '--project-name', 'MyApp')
    );
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid',
      expect.objectContaining({ classId: 'cid', projectName: 'MyApp' })
    );
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('export validation-rules command', () => {
  let exportSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exportSpy = jest
      .spyOn(clientModule, 'exportValidationRulesDocument')
      .mockResolvedValue({ rules: [] });
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls exportValidationRulesDocument', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('export', 'validation-rules', 'vid'));
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid',
      expect.objectContaining({})
    );
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('promote command', () => {
  let promoteSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    promoteSpy = jest
      .spyOn(clientModule, 'promoteVersion')
      .mockResolvedValue({
        promotion: { id: 'p1', project_id: 'proj', environment: 'staging', created_at: '2020-01-01T00:00:00Z', metadata: {} },
        live_version: { project_id: 'proj', environment: 'staging', metadata: {} },
      } as clientModule.SchemaPromotionResponse);
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls promoteVersion with valid environment and writes to stdout', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('promote', 'vid', '--environment', 'staging'));
    expect(promoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid',
      'staging',
      {}
    );
    expect(writeJsonSpy).toHaveBeenCalled();
    delete process.env.OBJECTIFIED_API_KEY;
  });

  it('exits with error for invalid environment value', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(runArgv('promote', 'vid', '--environment', 'production'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('dev|staging|prod')
    );
    expect(promoteSpy).not.toHaveBeenCalled();
    delete process.env.OBJECTIFIED_API_KEY;
  });

  it('accepts dev, staging, and prod as valid environments', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    for (const env of ['dev', 'staging', 'prod'] as const) {
      jest.clearAllMocks();
      await parseProgram(runArgv('promote', 'vid', '--environment', env));
      expect(promoteSpy).toHaveBeenCalledWith(
        expect.anything(),
        'vid',
        env,
        expect.anything()
      );
    }
    delete process.env.OBJECTIFIED_API_KEY;
  });
});

describe('codegen command', () => {
  let pullSpy: ReturnType<typeof jest.spyOn>;
  let writeJsonSpy: ReturnType<typeof jest.spyOn>;
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    pullSpy = jest
      .spyOn(clientModule, 'pullVersion')
      .mockResolvedValue({
        version_id: 'vid',
        pulled_at: '2020-01-01T00:00:00Z',
      } as clientModule.VersionPullResponse);
    writeJsonSpy = jest.spyOn(ioModule, 'writeJson').mockImplementation(() => undefined);
    mockedSpawnSync.mockReturnValue({ status: 0, error: undefined });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedSpawnSync.mockReset();
  });

  it('runs pull, writes file, then spawns exec shell command', async () => {
    process.env.OBJECTIFIED_API_KEY = 'k';
    await parseProgram(
      runArgv('codegen', '--version-id', 'vid', '--exec', 'echo hi', '--with-pull')
    );
    expect(pullSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k' }),
      'vid'
    );
    expect(writeJsonSpy).toHaveBeenCalled();
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'sh',
      ['-c', 'echo hi'],
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
    delete process.env.OBJECTIFIED_API_KEY;
  });
});
