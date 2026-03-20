# Operations: disaster recovery, backup, and logical export

This runbook describes how to protect Objectified data for disaster recovery (DR), with emphasis on **version history**, **immutable snapshots**, and related **audit** tables. It also covers **optional** application-level export/import, which complements—but does not replace—a full database backup.

For day-to-day **liveness/readiness**, **structured logging**, **correlation headers**, and **rate limiting**, see [objectified-rest/README.md](../objectified-rest/README.md) (sections *Health probes* and *Observability*).

---

## 1. What must be backed up

Objectified stores platform data in PostgreSQL, primarily in the **`objectified`** schema. A complete DR posture uses **full database backups** (or replicas) so that **all** tables, constraints, and referential integrity are preserved.

Tables that are especially important for **audit and version lineage** include:

| Table | Role |
|-------|------|
| `objectified.version_history` | Immutable audit log of changes to `version` rows (including commit/push/merge operations with snapshot metadata). |
| `objectified.version_snapshot` | Immutable committed snapshots of schema state (classes, properties) per revision. |
| `objectified.project_history` | Immutable audit log of `project` changes. |

Other tables (`tenant`, `account`, `project`, `version`, `class`, `property`, `class_property`, API keys, etc.) are required for a **consistent** restore. Restoring only the history tables without their referenced rows is not supported.

**Soft deletes**: Many entities use `deleted_at` instead of hard deletes. Backups capture these rows; retention policies should account for compliance needs.

---

## 2. PostgreSQL backup (recommended)

### 2.1 Logical dump (typical)

Use a **custom-format** dump for flexibility and parallel restore. Replace connection parameters and paths for your environment.

```bash
# Full cluster or single DB — example: single database containing the objectified schema
pg_dump \
  --format=custom \
  --file="objectified-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  --dbname="$DATABASE_URL"
```

**Schedule** dumps according to your RPO (recovery point objective). Store artifacts in encrypted, replicated object storage.

### 2.2 Restore (new instance or replacement)

1. **Provision** PostgreSQL and ensure extensions required by your migrations (for example `pgvector`) are installed.
2. **Stop** or **drain** application instances that write to the old database, or fail over DNS to a maintenance page.
3. **Restore** the dump:

```bash
pg_restore \
  --dbname="$DATABASE_URL_TARGET" \
  --clean \
  --if-exists \
  "objectified-YYYYMMDDTHHMMSSZ.dump"
```

Review `pg_restore` flags with your DBA: `--clean` drops objects before recreate; use a **blank** target DB when possible. For production, prefer **restore to a new cluster**, validate, then **cut over** connection strings.

4. **Apply** any migrations **not** already in the backup only if your runbook explicitly requires “dump + migrate forward”; normally a restore from a known-good dump should match schema revision already applied at backup time.
5. **Point** `objectified-rest` at the new `DATABASE_URL` (or equivalent `POSTGRES_*` settings).
6. **Verify** with **readiness** and smoke tests (below).

### 2.3 Continuous archiving / PITR

For **lower RPO** than periodic `pg_dump`, use PostgreSQL **WAL archiving** and **point-in-time recovery** per [PostgreSQL high availability and backup documentation](https://www.postgresql.org/docs/current/continuous-archiving.html). Objectified does not implement application-level WAL; this is entirely an infrastructure concern.

---

## 3. Application health during and after failover

Use the REST service probes so orchestrators do not send traffic until the app and database are coherent.

| Endpoint | Use |
|----------|-----|
| `GET /health` | **Liveness** — process is up; no dependency check. |
| `GET /ready` | **Readiness** — by default runs `SELECT 1` against PostgreSQL; returns **503** if the DB is unavailable. |

After restore or cutover:

- Expect **`/ready`** to fail until the new database accepts connections and credentials are correct.
- **`/health`** can still return 200 if only the process is running; **do not** use it alone to confirm database recovery.

Optional: set `READINESS_CHECK_DATABASE=false` only for special bootstrap cases (documented in the REST README)—not for normal production validation after DR.

---

## 4. Observability during DR events

- **Access logs**: When `LOG_HTTP_REQUESTS=true`, each request emits a structured `request_completed` line (except `GET /health` and `GET /ready`, which are omitted to reduce noise). Use **`X-Request-ID`** and **`X-Trace-ID`** to correlate client retries during failover.
- **Rate limits**: When `RATE_LIMIT_ENABLED=true`, **`/health`**, **`/ready`**, OpenAPI URLs, and `/docs` are **exempt** from sliding-window limits, so probes and dashboards keep working during traffic spikes.
- **429 responses**: Large export/import jobs may hit per-tenant or global RPM; tune `RATE_LIMIT_PER_MINUTE` or per-tenant/API-key RPM for bulk operations.

---

## 5. Optional logical export/import (schema documents)

The API can **export** and **import** **OpenAPI** and **JSON Schema** representations of a **version’s** active classes and properties. This is useful for **documentation**, **migration between environments**, or **partial** recovery of **schema definitions**.

It is **not** a full database backup:

- Does **not** include `version_history`, `version_snapshot`, `project_history`, tenants, users, or API keys.
- **Import** **upserts** by name (case-insensitive class names within the version; properties by name within the project). UUIDs and historical revisions are **not** replayed from export files alone.

### 5.1 Export (authenticated, `schema:read`)

Base path prefix: **`/v1`**.

| Method & path | Output |
|---------------|--------|
| `GET /v1/versions/{version_id}/export/openapi` | OpenAPI **3.2.0** JSON document. |
| `GET /v1/versions/{version_id}/export/jsonschema` | JSON Schema **2020-12** (all classes or one class via `class_id`). |
| `GET /v1/versions/{version_id}/export/validation-rules` | Compact validation rules JSON derived from the same resolved schema as OpenAPI export. |

Save responses to durable storage if used as a DR artifact; treat them as **sensitive** if they describe internal APIs.

### 5.2 Import (authenticated, `schema:write`)

| Method & path | Body |
|---------------|------|
| `POST /v1/versions/{version_id}/import/openapi` | JSON OpenAPI **3.x** document. |
| `POST /v1/versions/{version_id}/import/jsonschema` | JSON Schema **2020-12** document. |

**Workflow tip**: Create or select a **target version** in the DR environment, ensure **project** context matches expectations, then **import**. Resolve conflicts through normal **merge** workflows if import semantics are insufficient.

---

## 6. Suggested validation checklist after restore

1. `GET /ready` returns **200** with `checks.database: ok` (when database check is enabled).
2. Spot-check **critical tenants** via authenticated API or UI.
3. Verify **`version_history`** / **`version_snapshot`** row counts or latest revision per critical version if you maintain queries for this.
4. Review application logs for connection errors and **503** on `/ready`.

---

## 7. References in this repository

- [objectified-rest/README.md](../objectified-rest/README.md) — environment variables, probes, logging, rate limits, quotas.
- [objectified-schema/README.md](../objectified-schema/README.md) — schema application (`sem-apply`) and test database conventions.
