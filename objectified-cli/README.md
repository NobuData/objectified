# objectified-cli

Developer CLI for [objectified-rest](https://github.com/NobuData/objectified): pull/push version schema, export OpenAPI / JSON Schema / validation rules, and run **CI codegen hooks** after writing artifacts.

## Install

From the monorepo root (after `yarn install`):

```bash
yarn workspace objectified-cli build
# run via yarn:
yarn workspace objectified-cli exec objectified --help
# or link globally / call node on dist/cli.js
```

Binary entry: `objectified` → `dist/cli.js` (requires Node 20+).

## Authentication

Set **either** an API key **or** a JWT (same contract as the REST API and UI rest client):

| Variable | Header |
|----------|--------|
| `OBJECTIFIED_API_KEY` or `REST_API_KEY` | `X-API-Key` |
| `OBJECTIFIED_JWT` / `OBJECTIFIED_ACCESS_TOKEN` / `JWT_ACCESS_TOKEN` | `Authorization: Bearer` |

## API base URL

`OBJECTIFIED_API_URL` or `REST_API_BASE_URL` — base URL for the `/v1` API. If the value does not end with `/v1`, it is appended automatically (e.g. `http://localhost:8000` → `http://localhost:8000/v1`).

Per-command override: `--api-url`.

## Commands

### `objectified pull <versionId>`

Downloads `GET /v1/versions/{id}/pull`. Writes JSON to `-` (stdout) or `-o path`.

Options: `--revision`, `--since-revision`.

### `objectified push <sourceVersionId> --target <targetVersionId>`

`POST /v1/versions/{source}/push?target_version_id=...` with a JSON payload (`-f payload.json`). Payload shape matches `VersionCommitPayload` in the OpenAPI spec (`classes`, `canvas_metadata`, …).

### `objectified export openapi <versionId>`

`GET /v1/versions/{id}/export/openapi`. Optional `--options-file` JSON with keys such as `project_name`, `version`, `description`, `servers`, `tags`, `security`, `external_docs`, `metadata` (arrays/objects are sent as JSON strings per the API).

### `objectified export jsonschema <versionId>`

Optional: `--class-id`, `--project-name`, `--schema-version`, `--description`.

### `objectified export validation-rules <versionId>`

Optional: `--class-id`, `--title`.

### `objectified codegen`

For pipelines: optionally materialize `pull.json` and/or `openapi.json`, then run a shell command.

- `--version-id` — version UUID  
- `--exec` — passed to `sh -c` (Unix) or `cmd /c` (Windows)  
- `--dir` — output directory (default `.objectified`)  
- `--with-pull` / `--with-openapi` — write files before the hook  
- `--openapi-options-file` — same as `export openapi`

Environment for `--exec`:

| Variable | Meaning |
|----------|---------|
| `OBJECTIFIED_VERSION_ID` | Version UUID |
| `OBJECTIFIED_OUTPUT_DIR` | Resolved `--dir` |
| `OBJECTIFIED_PULL_PATH` | Absolute path to `pull.json` if written |
| `OBJECTIFIED_OPENAPI_PATH` | Absolute path to `openapi.json` if written |

**Example (generate TypeScript types from exported OpenAPI):**

```bash
export OBJECTIFIED_API_URL=http://localhost:8000
export OBJECTIFIED_API_KEY=...

objectified codegen \
  --version-id "$VERSION_ID" \
  --dir ./gen \
  --with-openapi \
  --exec 'npx openapi-typescript "$OBJECTIFIED_OPENAPI_PATH" -o ./gen/schema.ts'
```

## Reference

GitHub issue **#134** — CLI/SDK for pull/push, export, and codegen in CI/CD.
