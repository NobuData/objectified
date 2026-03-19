/**
 * Built-in code generation template registry and Mustache rendering for custom templates.
 *
 * Reference: GitHub #119 — configurable code generation templates.
 */

import Mustache from 'mustache';
import type { StudioClass } from './types';
import {
  buildCodegenMustacheView,
  generateTypeScript,
  generatePrisma,
  generateGraphQL,
  generateGo,
  generatePydantic,
  generateSqlDdl,
} from './codeGenerationEngine';
import { formatValidationRulesJson } from './validationRulesExport';

export type BuiltinTemplateId =
  | 'typescript'
  | 'prisma'
  | 'graphql'
  | 'go'
  | 'pydantic'
  | 'sql-ddl'
  | 'validation-rules';

export interface BuiltinTemplateMeta {
  id: BuiltinTemplateId;
  label: string;
  description: string;
  /** Monaco language id */
  language: string;
  fileHint: string;
}

export const BUILTIN_CODE_TEMPLATES: BuiltinTemplateMeta[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    description: 'export interface per class with id and typed fields',
    language: 'typescript',
    fileHint: 'types.ts',
  },
  {
    id: 'prisma',
    label: 'Prisma',
    description: 'Prisma model definitions (PostgreSQL / uuid)',
    language: 'prisma',
    fileHint: 'schema.prisma',
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    description: 'GraphQL SDL object types',
    language: 'graphql',
    fileHint: 'schema.graphql',
  },
  {
    id: 'go',
    label: 'Go structs',
    description: 'Go structs with uuid and json tags',
    language: 'go',
    fileHint: 'models.go',
  },
  {
    id: 'pydantic',
    label: 'Pydantic',
    description: 'Python Pydantic v2 models',
    language: 'python',
    fileHint: 'models.py',
  },
  {
    id: 'sql-ddl',
    label: 'SQL DDL',
    description: 'PostgreSQL DDL (same as SQL mode canvas export)',
    language: 'sql',
    fileHint: 'schema.sql',
  },
  {
    id: 'validation-rules',
    label: 'Validation rules (JSON)',
    description:
      'required, type, format, pattern, bounds, enum — for validators & docs (GitHub #122)',
    language: 'json',
    fileHint: 'validation-rules.json',
  },
];

const BUILTIN_GENERATORS: Record<BuiltinTemplateId, (classes: StudioClass[]) => string> = {
  typescript: generateTypeScript,
  prisma: generatePrisma,
  graphql: generateGraphQL,
  go: generateGo,
  pydantic: generatePydantic,
  'sql-ddl': generateSqlDdl,
  'validation-rules': (classes) => formatValidationRulesJson(classes),
};

export function generateFromBuiltinTemplate(
  id: BuiltinTemplateId,
  classes: StudioClass[]
): string {
  const fn = BUILTIN_GENERATORS[id];
  return fn ? fn(classes) : '';
}

/**
 * Render a user-defined Mustache template against the schema graph.
 * View shape: { classes: [{ name, snake, id, properties: [{ name, snake, column, optional, tsType, prismaType, ... }] }] }
 */
export function renderCustomMustacheTemplate(
  template: string,
  classes: StudioClass[]
): string {
  const view = buildCodegenMustacheView(classes);
  return Mustache.render(template, view);
}
