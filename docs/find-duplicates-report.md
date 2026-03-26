# GitHub issue duplicate analysis — NobuData/objectified

**Generated:** 2026-03-25  
**Scope:** 340 issues (PRs excluded).  
**Method:** Pairwise similarity on normalized title + body (with `**Reference**:` blocks stripped to reduce false positives from shared footers). Scores combine title Jaccard (~35%), body word Jaccard (~35%), and full-text sequence ratio (~30%). **Duplicate %** below is this combined score × 100 vs the single closest other issue—useful for ranking overlap, not a legalistic “plagiarism” measure.

---

## Summary

| Category | Finding |
|----------|---------|
| Strong topical pairs (expected templates) | Early DDL issues (#2–#11), dashboard “Create … page” tickets, property-form constraint tickets, push/pull toolbars, layout #571/#572 |
| Boilerplate duplication | Many issues share identical **Reference** one-liners (see clusters below)—often correct for a batch of work, but inflates raw text overlap if references are not stripped |
| True duplicate risk | **#571 / #572** are parallel “improve layout” tickets (class vs property form); consider consolidating or cross-linking |
| Thin descriptions | Several tickets lack acceptance criteria (called out in **Clarity**). |

---

## Per-issue duplicate similarity (closest other issue)

Sorted by **duplicate similarity %** (highest first). **Originality %** = 100 − duplicate % (approximate).

| # | Title | Dup % | Originality % | Closest other |
|---|-------|------:|--------------:|---------------|
| 571 | Improve layout of class form | 73.0 | 27.0 | 572 |
| 572 | Improve layout of the property form | 73.0 | 27.0 | 571 |
| 9 | Create property table | 71.3 | 28.7 | 10 |
| 10 | Create class table | 71.3 | 28.7 | 9 |
| 2 | Create tenant table | 68.3 | 31.7 | 5 |
| 5 | Create project table | 68.3 | 31.7 | 2 |
| 147 | Add project soft delete/archive and restore with status | 64.2 | 35.8 | 157 |
| 157 | Add class soft delete/archive and restore with optional status | 64.2 | 35.8 | 147 |
| 6 | Create version table | 59.6 | 40.4 | 5 |
| 51 | Create Tenants page in Dashboard | 57.4 | 42.6 | 55 |
| 55 | Create Projects page in Dashboard | 57.4 | 42.6 | 51 |
| 57 | Create Versions page in Dashboard | 56.7 | 43.3 | 55 |
| 68 | Add Toolbar for Push functionality | 56.5 | 43.5 | 69 |
| 69 | Add Toolbar for Pull functionality | 56.5 | 43.5 | 68 |
| 106 | Add string constraints to the property form | 55.6 | 44.4 | 107 |
| 107 | Add number/integer constraints to the property form | 55.6 | 44.4 | 106 |
| 52 | Create User-Tenant page in Dashboard | 55.0 | 45.0 | 53 |
| 53 | Create Tenant Administrators page in Dashboard | 55.0 | 45.0 | 52 |
| 11 | Create class property join table | 54.8 | 45.2 | 9 |
| 273 | Add object keywords: required, additionalProperties, ... | 54.3 | 45.7 | 285 |
| 285 | Add object: properties, required, additionalProperties, ... | 54.3 | 45.7 | 273 |
| 109 | Add object constraints to the property form | 54.0 | 46.0 | 106 |
| 72 | Add load revision to UI version history | 52.0 | 48.0 | 73 |
| 73 | Add rollback to UI version history | 52.0 | 48.0 | 72 |
| 108 | Add array constraints to the property form | 51.7 | 48.3 | 106 |
| 75 | Add history removal to UI version history | 51.5 | 48.5 | 73 |
| 71 | Add version history to UI | 51.2 | 48.8 | 73 |
| 50 | Create Users page in Dashboard | 50.7 | 49.3 | 58 |
| 58 | Create Publish page in Dashboard | 50.7 | 49.3 | 50 |
| 74 | Add branching to UI version history | 49.6 | 50.4 | 71 |
| 67 | Add Toolbar for commit | 48.3 | 51.7 | 68 |
| 36 | Create Version Commit REST services | 47.4 | 52.6 | 37 |
| 37 | Create Version Push REST services | 47.4 | 52.6 | 36 |
| 112 | Add extensions to the property form | 46.9 | 53.1 | 109 |
| 1 | Create user table | 46.0 | 54.0 | 2 |

*Remaining issues fall below ~45% on this metric vs their nearest neighbor (often still sharing table DDL or reference boilerplate). Full numeric table is in `/tmp/dup_analysis.json` if you need to regenerate or tune thresholds.*

---

## Duplicate clusters and indicative wording

### 1. Intentional schema “stamp” tickets (high structural overlap)

- **Wording pattern:** “Create initial * table. Table structure:”, repeated column tables, “Create appropriate indices…”, triggers for `updated_at`.
- **Examples:** #1–#11 (user, tenant, project, version, property, class, class-property junction, etc.).
- **Assessment:** Not duplicate issues—shared **spec template**. Keep; optionally add a parent epic and link children.

### 2. Dashboard page scaffolding (#50–#58, #52–#53)

- **Wording pattern:** “Create * page in Dashboard”, “**Reference**: New or refactored pages under dashboard…”
- **Pairs flagged:** #51↔#55, #57↔#55, #57↔#51, #52↔#53, #50↔#58 (title/body shell similarity).
- **Assessment:** Expected parallel UI work; **#50 vs #58** similarity is mostly generic “Create … page” framing—verify labels and cross-links so reviewers do not confuse scope.

### 3. Property form constraint mini-epic (#106–#112, #273, #285)

- **Wording pattern:** “Add * constraints to the property form”, shared field vocabulary (`minimum`, `maxLength`, `additionalProperties`, etc.).
- **Pairs:** #106↔#107, #106↔#109, #106↔#108; #273↔#285 (overlapping object keyword scope—**possible duplicate or split-decomposition**; confirm whether one subsumes the other).

### 4. Git-like version REST (#36–#41)

- **Wording pattern:** “**Reference**: New routes e.g. `POST /v1/versions/{id}/commit`, … `schema-merge.ts`…”
- **Assessment:** Same reference block across commit/push/pull/merge/review tickets—correct for a bundle; overlap is **not** redundant scope by itself.

### 5. UI layout polish (#571, #572)

- **Wording pattern:** “Improve layout of the * form to match more of the style of `objectified-commercial/objectified-ui`…”
- **Assessment:** ~**73%** similarity—same acceptance template with “class” vs “property” swapped. Treat as **paired siblings**; optional merge into one issue with two checklists to avoid divergent UX.

### 6. Shared **Reference** lines (copy-paste detector)

Many issues share the **exact** first line after the bold **Reference** marker. Examples (issue counts approximate—batch templates):

| Reference line (truncated) | Example issue numbers |
|----------------------------|------------------------|
| New UI under Studio or Dashboard (e.g. “Generate code” action); template registry… | #119–#122, #301–#305 |
| ClassEditDialog, PropertyDialog, version history; “Annotations” or “Codegen”… | #123–#126, #306–#310 |
| ClassEditDialog, PropertyFormFields, canvas edges; mode selector… | #115–#118, #296–#300 |
| auth routes, middleware; new tables or config for roles/permissions… | #127–#129, #311–#315 |
| new health routes; logging middleware; rate-limit… | #130–#133, #316–#320 |
| new CLI package or script; webhook table… | #134–#137, #321–#325 |
| docker-compose, sample data seeds; OpenAPI UI… | #138–#140, #326–#330 |
| Extend `objectified-commercial/.../auth.py` and routes under `/v1/users`… | #13, #15–#20 |
| `projects_routes.py`, `versions_routes.py`; history tables and `/v1/versions/{id}/history`… | #22–#26 |
| `classes_routes.py`, `properties_routes.py`, `get_classes_with_properties…` | #27–#31 |
| New routes commit/push/pull/merge + `schema-merge.ts` | #36–#40 |

**Indicative wording:** entire bold **Reference** paragraph repeated verbatim across an epic—**duplication is in the template**, not necessarily the feature description above it.

---

## Issues that could be clarified or improved

| # | Observation |
|---|-------------|
| **344** | Body: “Login is failing. Fix.” — no repro, expected behavior, or component path. |
| **562** | “Add linting” — list which packages/workflows; define Prettier vs Ruff ownership per folder. |
| **56** | Open import for versions — clarify whether blocked on REST import (#34) vs UI-only. |
| **42** | Auditing REST usage — scope is large; add checklist or phased file list. |
| **3** | Title says “tenant to **account**” relationship; body uses `tenant_user` / `account_id` — align naming (“account” vs “user”) in title vs schema. |
| **273 vs 285** | Both cover object keywords (`required`, `additionalProperties`, `unevaluatedProperties`); add one sentence each on **exclusivity** (split work) or close one as duplicate. |
| **Epic templates** | For batches (#301+, auth #311+, ops #316+), add a short **unique** paragraph per issue describing the *delta* vs siblings so search and AI triage distinguish them without reading only the reference footer. |

---

## How to reproduce

Raw export (includes PRs) was pulled from the public GitHub REST API; PRs were filtered out. Analysis script output: `/tmp/dup_analysis.json` (local machine only—regenerate if needed).

---

## Caveats

- **Reference stripping** removes single-line `**Reference**:` blocks greedily; multi-line references may still overlap.
- **High %** means “similar to one other issue,” not “duplicate of entire backlog.”
- Database DDL issues will always cluster in automated scans because of identical table preamble text.
