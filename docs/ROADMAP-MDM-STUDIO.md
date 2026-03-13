## Roadmap: MDM Mapping Studio

This document outlines a possible roadmap for building an **MDM Mapping Studio** on top of Objectified’s schema design and versioning. The goal is to help teams **migrate data from one schema version to another** (and between arbitrary schemas) using **visual mappings** and **simple, composable rules** expressed as algebraic-style expressions (e.g. split, concat, upper/lower, trim, conditional, casting).

The Studio focuses on:

- **Visual schema-to-schema mappings** (source → target) with fully-expanded schemas on a canvas.
- **Rule chains** between fields, expressed as both **visual nodes and edges** and as **dot-notation expressions**.
- **Re-usable rulesets** for version-to-version migrations and cross-domain transformations.
- **Execution and validation** pipelines that ensure data integrity while allowing iterative design and testing.

---

## 1. Overview

### 1.1 What is the MDM Mapping Studio?

The **MDM Mapping Studio** is an interactive workspace for:

- Selecting **source** and **target** schemas (often different versions of the same logical model).
- Visually **expanding** both schemas into full property trees on a canvas.
- Drawing **connections (edges)** from source fields to target fields.
- Inserting **rule nodes** on those edges (e.g. `split`, `concat`, `upper`, `lower`, `capitalize`, `trim`, `coalesce`, `if/else`, `cast`).
- Managing **rule chains** that can:
  - **Fan out** a single input into many outputs (e.g. `name → split → first_name`, `name → split → last_name`).
  - **Fan in** many inputs into one output (e.g. `street`, `city`, `postal_code` → `concat` → `full_address`).

Mappings are defined in a way that is:

- **Visually intuitive** (nodes and edges on a canvas).
- **Textually precise** (dot-notation expressions such as `source.person.name.first`).
- **Version-aware** (explicitly tied to source and target schema versions).

### 1.2 Why Full, Expanded Schemas Matter

To ensure mappings are **complete and reliable**, the Studio always works with **fully-expanded schemas**:

- Objects and nested objects are expanded into **property trees**.
- Collections (arrays, maps) are represented with explicit **item** or **entry** types.
- Each **leaf property** on source and target is independently mappable.

This enables:

- Clear visibility into every field that **must or could be mapped**.
- Accurate **dot-notation** (e.g. `order.customer.address.street`) that corresponds 1:1 with visual nodes.
- Robust validation (e.g. “this required target field has no mapping”).

---

## 2. Relationship to Existing Objectified Schema and Versioning

Objectified already provides:

- **Schema design & versioning**: `tenant` → `project` → `version` → `class` / `property` / `class_property`.
- **Version snapshots**: `version_snapshot`, `version_history` for tracking schema evolution.
- **Imports**: OpenAPI / JSON Schema imports into classes and properties.

The MDM Mapping Studio builds on this by:

- Treating each **schema version** as a set of **classes** with fully-expanded properties.
- Introducing dedicated entities for:
  - **Mapping projects** (e.g. “v1 → v2 mappings for Customer domain”).
  - **Schema pairs** (`source_version_id`, `target_version_id`, optional class pairs).
  - **Mappings** between **source paths** and **target paths**.
  - **Rule chains** that transform values along those paths.

Mappings are always:

- **Scoped** to a specific tenant/project and version pair.
- **Re-usable** across executions (batch migrations, streaming transforms, on-demand conversions).

---

## 3. High-Level Architecture

```mermaid
flowchart TB
    subgraph Schema["Schema layer (existing)"]
        tenant[tenant]
        project[project]
        version[version]
        class[class]
        property[property]
        class_property[class_property]
        tenant --> project --> version --> class
        class --> class_property --> property
    end

    subgraph Mapping["MDM Mapping Studio"]
        map_project[mapping_project]
        map_schema_pair[mapping_schema_pair\n(source_version, target_version)]
        map_class_pair[mapping_class_pair\n(source_class, target_class)]
        map_edge[mapping_edge\n(source_path, target_path)]
        rule_chain[rule_chain]
        rule_step[rule_step\n(split, concat, upper, ...)]

        map_project --> map_schema_pair --> map_class_pair
        map_class_pair --> map_edge --> rule_chain --> rule_step
    end

    subgraph Runtime["Execution & Validation"]
        run_config[mapping_run_config]
        run_job[mapping_run_job]
        run_result[mapping_run_result]
        preview["Preview / diff\n(before & after)"]
    end

    Mapping --> Runtime
```

---

## 4. Conceptual Data Model

### 4.1 Core Mapping Entities

| Entity | Purpose |
|--------|---------|
| **mapping_project** | Logical container for related mappings (e.g. “Customer v1 → v2 migration”). Scoped to tenant/project. |
| **mapping_schema_pair** | Connects a **source schema version** to a **target schema version** (`source_version_id`, `target_version_id`). |
| **mapping_class_pair** | Pairs a **source class** with a **target class** for a given schema pair. |
| **mapping_edge** | Represents a mapping from **source path** to **target path** (e.g. `source.person.name` → `target.person.first_name`). Optionally references a `rule_chain_id`. |
| **rule_chain** | Ordered set of transformation steps from input to output; may be reused across many edges. |
| **rule_step** | Single operation in a chain (e.g. `split`, `concat`, `upper`, `lower`, `trim`, `capitalize`, `substring`, `coalesce`, `if`, `cast`). Holds parameters and input/output wiring. |

### 4.2 Path and Dot-Notation Representation

- **Paths** are stored as canonical dot-notation strings:
  - `source_path`: e.g. `source.person.name`, `source.person.address.street`.
  - `target_path`: e.g. `target.person.first_name`, `target.person.last_name`.
- Internally, the UI and runtime:
  - Maintain a **tree representation** for each class to render on the canvas.
  - Map between tree nodes and dot-notation paths.

Rules use these paths as:

- **Inputs**: `input.person.name`, `input.order.total`, etc.
- **Outputs**: `output.person.first_name`, `output.person.last_name`, etc.

Example:

- Visual: `name` → `split` → `capitalize` → `first_name`.
- Expression view: `output.person.first_name = capitalize(split(input.person.name, " ")[0])`.

---

## 5. Visual Mapping Canvas

### 5.1 Canvas Layout

The Mapping Studio canvas shows:

- **Left side**: fully-expanded **source schema** tree (classes and properties).
- **Right side**: fully-expanded **target schema** tree.
- **Center**: **rule nodes** and **edges** connecting source paths to target paths.

Key characteristics:

- Each source and target **leaf property** is rendered as a **node** that can be dragged onto the canvas or directly connected.
- When a property’s type is an object, its children are expanded beneath it; both the parent and children are referenceable.
- Lines (edges) between nodes can:
  - Connect **source node → rule node → target node**.
  - Connect **source node → rule node → rule node → target node** (chains).
  - Splinter from a rule node to **multiple** targets (fan-out).

### 5.2 Rule Nodes and Chains (Visual)

Rule chains are visualized as **node pipelines**:

- Each **rule_step** is a box with a label (e.g. `SPLIT(" ")`, `UPPER()`, `CONCAT(" ")`).
- Inputs and outputs are shown as **ports**:
  - Source fields connect into the **input port** of the first rule.
  - Target fields connect from the **output port** of the last rule.
- Multiple targets can consume the **same chain** output, or the chain can **branch** explicitly.

Example visual chain:

- `name` → `SPLIT(" ")` → `CAPITALIZE()` → `first_name`
- `name` → `SPLIT(" ")` → `CAPITALIZE()` → `last_name`

Internally this might be represented as:

- One shared `rule_chain` with an indexed output array from `SPLIT`, and two `mapping_edge` rows wiring:
  - `first_name` to `CAPITALIZE(split(name)[0])`
  - `last_name` to `CAPITALIZE(split(name)[1])`

---

## 6. Rule Engine and Expressions

### 6.1 Rule Expression Language

Rules are simple algebraic-style expressions over fields:

- **String ops**: `split`, `concat`, `upper`, `lower`, `capitalize`, `trim`, `substring`, `replace`.
- **Numeric ops**: `+`, `-`, `*`, `/`, `round`, `ceil`, `floor`, `abs`.
- **Conditional**: `if`, ternary-like constructs, `coalesce`.
- **Casting**: `to_string`, `to_int`, `to_float`, `to_bool`, date conversions.

Example expressions:

- `output.person.first_name = capitalize(split(input.person.name, " ")[0])`
- `output.person.last_name = capitalize(split(input.person.name, " ")[1])`
- `output.person.full_name = concat(input.person.first_name, " ", input.person.last_name)`
- `output.order.total_with_tax = round(input.order.subtotal * 1.07, 2)`

### 6.2 Rule Chains vs Per-Field Rules

The engine supports:

- **Per-field rules**: one independent expression per target field.
- **Shared rule chains**: intermediate nodes that can be reused:
  - e.g. a `normalize_name` rule chain that splits, trims, and capitalizes a name, then exposes `first`, `middle`, `last` outputs.

Internally:

- `rule_chain` defines the graph of `rule_step` nodes and their wiring.
- `mapping_edge` binds specific **chain outputs** to **target paths**.

---

## 7. Execution Pipeline (Migration Runs)

### 7.1 Batch and Streaming Modes

The Mapping Studio’s mappings can be executed in different contexts:

- **Batch migration** (one-time or periodic):
  - Read records from **source storage** (e.g. old schema tables, golden records, or external source).
  - Apply mapping project (schema pair + class pairs + rule chains).
  - Write records to **target storage** (new schema version tables, new domain).
- **On-demand / API-based transform**:
  - Given a payload shaped like the source class, return a payload shaped like the target class.
- **Streaming** (future phase):
  - Apply mappings to event streams (e.g. Kafka topics).

### 7.2 Execution Configuration

Key concepts:

- **mapping_run_config**:
  - References a `mapping_project` and one or more `mapping_class_pair`s.
  - Defines source location (table/topic/API) and target location.
  - Specifies runtime options (batch size, error handling, dry-run vs commit).
- **mapping_run_job**:
  - A concrete run of a configuration.
  - Tracks status, counts, and timestamps.
- **mapping_run_result**:
  - Summarizes outcomes: processed, succeeded, failed, warnings.
  - Optionally stores sample records (before/after, errors) for debugging.

---

## 8. Validation, Testing, and Safety

### 8.1 Static Validation

Before running a mapping, the system validates:

- Every **required target field** has:
  - A direct mapping, or
  - A default value / rule, or
  - An explicit ignore with justification.
- Every mapping edge:
  - Connects compatible types (or has an explicit cast).
  - Uses valid source/target paths.
- Rule chains:
  - Have all required parameters.
  - Have consistent input/output types along the chain.

Violations are shown in the UI as:

- **Errors** (must fix before running).
- **Warnings** (allowed but highlighted).

### 8.2 Sample-Based Testing and Preview

The Studio provides:

- **Sample execution**:
  - Run mapping on a small sample set (e.g. 100 rows).
  - Show before/after payloads and rule trace.
- **Diff view**:
  - For migrations (v1 → v2 within same domain), show structural and value diffs.
- **Per-field lineage**:
  - For each target field, show which source paths and rules produced its value.

---

## 9. Governance, Versioning, and Reuse

### 9.1 Versioning of Mappings

Mappings themselves are versioned:

- `mapping_project` has its own **version history**, allowing:
  - Changes to rules over time.
  - Rollbacks and comparisons between mapping versions.
- Each mapping project is tied to:
  - A **source schema version** and **target schema version**.
  - Optional class-level and field-level constraints.

When schemas evolve further (e.g. v2 → v3):

- New **mapping_schema_pair** entries point from v2 to v3.
- Existing rules and edges can be:
  - Cloned and adapted.
  - Reused where compatible.

### 9.2 Library of Shared Rules and Patterns

To avoid duplication:

- Frequently used rule chains (e.g. `normalize_name`, `normalize_address`, `standardize_phone`) can be saved as **library items**.
- These library rules:
  - Appear in a palette in the canvas.
  - Can be parameterized (e.g. locale for address normalization).
  - Are referenced by many mapping edges but maintained centrally.

---

## 10. Roadmap Phases

### Phase 1: Mapping Foundations (Data Model + APIs)

- **Goals**: Define fundamental entities for mapping and rules without UI yet.
- **Deliverables**:
  - Schema and migrations for:
    - `mapping_project`
    - `mapping_schema_pair`
    - `mapping_class_pair`
    - `mapping_edge`
    - `rule_chain`
    - `rule_step`
  - REST/OpenAPI for:
    - CRUD on mapping projects and schema pairs.
    - CRUD on rule chains and rule steps.
    - CRUD on mapping class pairs and edges.

### Phase 2: Schema Expansion and Path Handling

- **Goals**: Expose fully-expanded schemas and canonical dot-notation paths.
- **Deliverables**:
  - Services to:
    - Load a schema version and expand each class into a **property tree**.
    - Generate **canonical paths** for each node.
  - API endpoints to:
    - List expanded classes and property trees for a given version.
    - Resolve a path string to a node and vice versa.
  - Internal utilities for type inference, nullability, and required/optional flags.

### Phase 3: Visual Mapping Canvas (MVP)

- **Goals**: Provide a basic visual canvas for building mappings and rule chains.
- **Deliverables**:
  - UI:
    - Select `mapping_project` and schema pair.
    - Display source and target trees (left/right).
    - Allow drag-and-drop connections from source field to target field.
  - Rule support (MVP):
    - Inline per-field expression editor (e.g. Monaco-based) with autocomplete for paths.
    - Visualization of a single rule step per edge (no branching yet).
  - Persistence:
    - Sync visual edits back to `mapping_edge` and rule entities.

### Phase 4: Rule Chains, Fan-Out / Fan-In

- **Goals**: Support more complex rule networks and multi-target mappings.
- **Deliverables**:
  - UI:
    - Palette of rule node types (split, concat, upper, lower, trim, coalesce, etc.).
    - Ability to place rule nodes and connect them in chains.
    - Support for fan-out and fan-in:
      - One source → rule chain → multiple targets.
      - Multiple sources → rule chain → one target.
  - Engine:
    - Execution model for rule graphs, including intermediate outputs.
    - Validation for cycles and incompatible types.
  - Examples:
    - Built-in flows such as:
      - `name → split → capitalize → first_name` and `last_name`.
      - `street`, `city`, `postal_code` → `concat` → `address_line`.

### Phase 5: Execution Engine and Run Management

- **Goals**: Execute mappings against real data for migrations and transformations.
- **Deliverables**:
  - `mapping_run_config`, `mapping_run_job`, `mapping_run_result` tables.
  - Runtime service to:
    - Iterate over source records.
    - Apply mappings and rule chains.
    - Write to target storage.
    - Capture metrics and sample results.
  - APIs and CLI/Job runners to start runs (including dry-run mode).

### Phase 6: Validation, Preview, and Debugging

- **Goals**: Make mappings safe to change and easy to debug.
- **Deliverables**:
  - Static validation:
    - Required-target coverage.
    - Type compatibility checks.
    - Rule chain validation.
  - Preview:
    - Sample-based execution with before/after views.
    - Per-field lineage visualization (source fields + rule chain).
  - Error reporting:
    - Per-record errors with pointers to failing rules or paths.

### Phase 7: Governance, Versioning, and Reuse

- **Goals**: Treat mappings as first-class, versioned artifacts.
- **Deliverables**:
  - Versioning support for `mapping_project` (or a dedicated mapping version entity).
  - Compare view between mapping versions (show changed edges and rules).
  - Library of shared rule chains with search and tagging.
  - Optional approvals / review workflow for promoting mappings to production.

---

## 11. Summary

| Requirement | How it’s addressed |
|------------|--------------------|
| **Migrate data from one schema version to another** | `mapping_project` and `mapping_schema_pair` define source and target versions; `mapping_class_pair`/`mapping_edge` + rule chains define how fields move and transform. |
| **Visual mapping between schemas** | Canvas shows full source and target trees; users draw edges and insert rule nodes between them. |
| **Simple algebraic rules (split, concat, case, etc.)** | `rule_step` supports a palette of basic operations; `rule_chain` composes them into pipelines. |
| **Full, expanded schemas on canvas** | A schema expansion service builds full property trees; each leaf and object path is individually mappable and referenceable via dot-notation. |
| **Dot-notation expressions** | Paths like `input.person.name` and `output.person.first_name` are used in expressions and map 1:1 to visual nodes. |
| **Multiple rules per field and fan-out/fan-in** | Rule chains support multiple steps and branching; a single input can produce multiple outputs and multiple inputs can be combined into one output. |
| **Validation and safe execution** | Static validation, sample-based preview, and detailed run results ensure mappings are correct before and during execution. |
| **Governance and reuse** | Mapping projects and rules are versioned; shared rule chains are stored in a library and reused across mappings and schema versions. |

This roadmap positions the **MDM Mapping Studio** as a first-class, visual environment for defining and executing schema-to-schema mappings, with simple yet powerful rule chains, complete schema visibility on the canvas, and strong validation and governance for safe, repeatable migrations.

