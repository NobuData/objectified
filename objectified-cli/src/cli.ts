#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { Command } from 'commander';
import {
  CliApiError,
  exportJsonSchemaDocument,
  exportOpenApiDocument,
  exportValidationRulesDocument,
  loadConfigFromEnv,
  openApiOptionsToQuery,
  pullVersion,
  pushVersion,
  readJsonFile,
  type OpenApiExportOptions,
  type VersionCommitPayload,
} from './client';
import { writeJson } from './io';

function die(e: unknown): never {
  if (e instanceof CliApiError) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

function readPkgVersion(): string {
  const path = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  return pkg.version;
}

function applyUrlOverride(cfg: ReturnType<typeof loadConfigFromEnv>, apiUrl?: string) {
  if (!apiUrl) return cfg;
  const normalized = apiUrl.replace(/\/$/, '');
  return {
    ...cfg,
    baseUrl: normalized.endsWith('/v1') ? normalized : `${normalized}/v1`,
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('objectified')
    .description(
      'Objectified developer CLI: pull/push version schema, export OpenAPI/JSON Schema/validation rules, run CI codegen hooks.'
    )
    .version(readPkgVersion());

  program
    .command('pull')
    .description('GET /versions/{id}/pull — write schema snapshot JSON')
    .argument('<versionId>', 'Version UUID')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-o, --output <path>', 'Output file (default: stdout)', '-')
    .option('--revision <n>', 'Pinned snapshot revision', (v) => parseInt(v, 10))
    .option('--since-revision <n>', 'Include diff since revision', (v) => parseInt(v, 10))
    .action(async (versionId, opts: { apiUrl?: string; output: string; revision?: number; sinceRevision?: number }) => {
      try {
        const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
        const revision = Number.isFinite(opts.revision) ? opts.revision : undefined;
        const sinceRevision = Number.isFinite(opts.sinceRevision) ? opts.sinceRevision : undefined;
        const data = await pullVersion(cfg, versionId, {
          revision,
          sinceRevision,
        });
        writeJson(data, opts.output === '-' ? undefined : opts.output);
      } catch (e) {
        die(e);
      }
    });

  program
    .command('push')
    .description('POST /versions/{source}/push?target_version_id= — apply payload to target version')
    .argument('<sourceVersionId>', 'Source version UUID (metadata for the operation)')
    .requiredOption('--target <targetVersionId>', 'Target version UUID')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-f, --payload <path>', 'JSON file: VersionCommitPayload (classes, canvas_metadata, …)')
    .action(async (sourceVersionId, opts: { apiUrl?: string; target: string; payload?: string }) => {
      try {
        const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
        let payload: VersionCommitPayload = {};
        if (opts.payload) {
          payload = readJsonFile(opts.payload) as VersionCommitPayload;
        }
        const res = await pushVersion(cfg, sourceVersionId, opts.target, payload);
        writeJson(res, '-');
      } catch (e) {
        die(e);
      }
    });

  const exportCmd = program.command('export').description('Download generated documents from the API');

  exportCmd
    .command('openapi')
    .description('Export OpenAPI 3.2 JSON for a version')
    .argument('<versionId>', 'Version UUID')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-o, --output <path>', 'Output file (default: stdout)', '-')
    .option('--options-file <path>', 'JSON file with optional keys: project_name, version, description, servers, tags, security, external_docs, metadata')
    .action(async (versionId, opts: { apiUrl?: string; output: string; optionsFile?: string }) => {
      try {
        const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
        let extra: OpenApiExportOptions = {};
        if (opts.optionsFile) {
          extra = readJsonFile(opts.optionsFile) as OpenApiExportOptions;
        }
        // Validate options serialize (catch bad JSON values early)
        openApiOptionsToQuery(extra);
        const doc = await exportOpenApiDocument(cfg, versionId, extra);
        writeJson(doc, opts.output === '-' ? undefined : opts.output);
      } catch (e) {
        die(e);
      }
    });

  exportCmd
    .command('jsonschema')
    .description('Export JSON Schema 2020-12 for a version (or one class)')
    .argument('<versionId>', 'Version UUID')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-o, --output <path>', 'Output file (default: stdout)', '-')
    .option('--class-id <uuid>', 'Export a single class')
    .option('--project-name <name>', 'Override title')
    .option('--schema-version <ver>', 'Override document version string')
    .option('--description <text>', 'Override description')
    .action(
      async (
        versionId,
        opts: {
          apiUrl?: string;
          output: string;
          classId?: string;
          projectName?: string;
          schemaVersion?: string;
          description?: string;
        }
      ) => {
        try {
          const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
          const doc = await exportJsonSchemaDocument(cfg, versionId, {
            classId: opts.classId,
            projectName: opts.projectName,
            schemaVersion: opts.schemaVersion,
            description: opts.description,
          });
          writeJson(doc, opts.output === '-' ? undefined : opts.output);
        } catch (e) {
          die(e);
        }
      }
    );

  exportCmd
    .command('validation-rules')
    .description('Export validation-rules JSON for a version (or one class)')
    .argument('<versionId>', 'Version UUID')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-o, --output <path>', 'Output file (default: stdout)', '-')
    .option('--class-id <uuid>', 'Export a single class')
    .option('--title <text>', 'Override document title')
    .action(async (versionId, opts: { apiUrl?: string; output: string; classId?: string; title?: string }) => {
      try {
        const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
        const doc = await exportValidationRulesDocument(cfg, versionId, {
          classId: opts.classId,
          title: opts.title,
        });
        writeJson(doc, opts.output === '-' ? undefined : opts.output);
      } catch (e) {
        die(e);
      }
    });

  program
    .command('codegen')
    .description(
      'Write pull/openapi (optional) into a directory, then run a shell command for downstream generators (CI).'
    )
    .requiredOption('--version-id <uuid>', 'Version to export')
    .requiredOption('--exec <shell>', 'Shell command (run with sh -c)')
    .option('--api-url <url>', 'Override OBJECTIFIED_API_URL (base; /v1 added if missing)')
    .option('-d, --dir <path>', 'Output directory', '.objectified')
    .option('--with-pull', 'Write pull.json')
    .option('--with-openapi', 'Write openapi.json')
    .option('--openapi-options-file <path>', 'JSON options for OpenAPI export (same as export openapi)')
    .action(
      async (opts: {
        versionId: string;
        exec: string;
        apiUrl?: string;
        dir: string;
        withPull: boolean;
        withOpenapi: boolean;
        openapiOptionsFile?: string;
      }) => {
        try {
          const cfg = applyUrlOverride(loadConfigFromEnv(), opts.apiUrl);
          const outDir = resolve(opts.dir);
          let openapiPath = '';
          let pullPath = '';

          if (opts.withPull) {
            const pull = await pullVersion(cfg, opts.versionId);
            const p = resolve(outDir, 'pull.json');
            writeJson(pull, p);
            pullPath = p;
          }
          if (opts.withOpenapi) {
            let extra: OpenApiExportOptions = {};
            if (opts.openapiOptionsFile) {
              extra = readJsonFile(opts.openapiOptionsFile) as OpenApiExportOptions;
            }
            openApiOptionsToQuery(extra);
            const doc = await exportOpenApiDocument(cfg, opts.versionId, extra);
            const p = resolve(outDir, 'openapi.json');
            writeJson(doc, p);
            openapiPath = p;
          }

          const env = {
            ...process.env,
            OBJECTIFIED_VERSION_ID: opts.versionId,
            OBJECTIFIED_OUTPUT_DIR: outDir,
            OBJECTIFIED_PULL_PATH: pullPath,
            OBJECTIFIED_OPENAPI_PATH: openapiPath,
          };
          const isWin = process.platform === 'win32';
          const r = isWin
            ? spawnSync(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', opts.exec], {
                env,
                stdio: 'inherit',
                cwd: process.cwd(),
              })
            : spawnSync('sh', ['-c', opts.exec], {
                env,
                stdio: 'inherit',
                cwd: process.cwd(),
              });
          if (r.error) throw r.error;
          process.exit(r.status ?? 1);
        } catch (e) {
          die(e);
        }
      }
    );

  await program.parseAsync(process.argv);
}

main().catch(die);
