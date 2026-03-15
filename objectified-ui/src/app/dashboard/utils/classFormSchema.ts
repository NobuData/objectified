/**
 * Build OpenAPI 3.2.0 / JSON Schema 2020-12 class schema from form state.
 * Used by ClassDialog for create/edit. Reference: GitHub #95.
 */

export interface ClassFormSchemaState {
  allOf: string[];
  oneOf: string[];
  anyOf: string[];
  discriminatorProperty: string;
  discriminatorMapping: Record<string, string>;
  additionalPropertiesType: 'default' | 'allow' | 'disallow' | 'schema';
  additionalPropertiesSchema: string;
  unevaluatedPropertiesType: 'default' | 'allow' | 'disallow' | 'schema';
  unevaluatedPropertiesSchema: string;
  deprecated: boolean;
  deprecationMessage: string;
  minProperties: string;
  maxProperties: string;
  examples: string[];
  externalDocsUrl: string;
  externalDocsDescription: string;
}

const REF_PREFIX = '#/components/schemas/';

function refForClassName(name: string): string {
  return `${REF_PREFIX}${name}`;
}

/**
 * Build a JSON Schema / OpenAPI 3.2.0 schema object from form state.
 * Returns undefined if the form has no schema fields set (plain class).
 */
export function buildSchemaFromForm(
  form: ClassFormSchemaState
): Record<string, unknown> | undefined {
  const schema: Record<string, unknown> = {};

  if (form.allOf.length > 0) {
    schema.allOf = form.allOf.map((name) => ({ $ref: refForClassName(name) }));
  }
  if (form.oneOf.length > 0) {
    schema.oneOf = form.oneOf.map((name) => ({ $ref: refForClassName(name) }));
  }
  if (form.anyOf.length > 0) {
    schema.anyOf = form.anyOf.map((name) => ({ $ref: refForClassName(name) }));
  }

  if (form.discriminatorProperty.trim()) {
    const disc: Record<string, unknown> = {
      propertyName: form.discriminatorProperty.trim(),
    };
    if (Object.keys(form.discriminatorMapping).length > 0) {
      const mapping: Record<string, string> = {};
      for (const [k, v] of Object.entries(form.discriminatorMapping)) {
        if (v.trim()) mapping[k] = refForClassName(v.trim());
      }
      if (Object.keys(mapping).length > 0) disc.mapping = mapping;
    }
    schema.discriminator = disc;
  }

  if (form.additionalPropertiesType !== 'default') {
    if (form.additionalPropertiesType === 'allow') {
      schema.additionalProperties = true;
    } else if (form.additionalPropertiesType === 'disallow') {
      schema.additionalProperties = false;
    } else if (
      form.additionalPropertiesType === 'schema' &&
      form.additionalPropertiesSchema.trim()
    ) {
      schema.additionalProperties = {
        $ref: refForClassName(form.additionalPropertiesSchema.trim()),
      };
    }
  }

  if (form.unevaluatedPropertiesType !== 'default') {
    if (form.unevaluatedPropertiesType === 'allow') {
      schema.unevaluatedProperties = true;
    } else if (form.unevaluatedPropertiesType === 'disallow') {
      schema.unevaluatedProperties = false;
    } else if (
      form.unevaluatedPropertiesType === 'schema' &&
      form.unevaluatedPropertiesSchema.trim()
    ) {
      schema.unevaluatedProperties = {
        $ref: refForClassName(form.unevaluatedPropertiesSchema.trim()),
      };
    }
  }

  if (form.deprecated) {
    schema.deprecated = true;
    if (form.deprecationMessage.trim()) {
      schema.deprecationMessage = form.deprecationMessage.trim();
    }
  }

  const minP = form.minProperties.trim();
  if (minP) {
    const n = parseInt(minP, 10);
    if (!Number.isNaN(n) && n >= 0) schema.minProperties = n;
  }
  const maxP = form.maxProperties.trim();
  if (maxP) {
    const n = parseInt(maxP, 10);
    if (!Number.isNaN(n) && n >= 0) schema.maxProperties = n;
  }

  if (form.examples.length > 0) {
    const parsed: unknown[] = [];
    for (const ex of form.examples) {
      const s = ex.trim();
      if (!s) continue;
      try {
        parsed.push(JSON.parse(s));
      } catch {
        // Skip invalid JSON
      }
    }
    if (parsed.length > 0) schema.examples = parsed;
  }

  if (form.externalDocsUrl.trim()) {
    schema.externalDocs = {
      url: form.externalDocsUrl.trim(),
      ...(form.externalDocsDescription.trim()
        ? { description: form.externalDocsDescription.trim() }
        : {}),
    };
  }

  if (Object.keys(schema).length === 0) return undefined;
  return schema;
}

/**
 * Hydrate form schema state from an existing class schema (for edit mode).
 */
export function schemaToFormState(
  schema: Record<string, unknown> | undefined
): ClassFormSchemaState {
  const s = schema ?? {};
  const allOf = Array.isArray(s.allOf)
    ? (s.allOf as { $ref?: string }[])
        .map((x) => (x.$ref ?? '').split('/').pop() ?? '')
        .filter(Boolean)
    : [];
  const oneOf = Array.isArray(s.oneOf)
    ? (s.oneOf as { $ref?: string }[])
        .map((x) => (x.$ref ?? '').split('/').pop() ?? '')
        .filter(Boolean)
    : [];
  const anyOf = Array.isArray(s.anyOf)
    ? (s.anyOf as { $ref?: string }[])
        .map((x) => (x.$ref ?? '').split('/').pop() ?? '')
        .filter(Boolean)
    : [];

  const disc = s.discriminator as { propertyName?: string; mapping?: Record<string, string> } | undefined;
  const discriminatorMapping: Record<string, string> = {};
  if (disc?.mapping && typeof disc.mapping === 'object') {
    for (const [k, v] of Object.entries(disc.mapping)) {
      const name = typeof v === 'string' ? v.split('/').pop() ?? '' : '';
      if (name) discriminatorMapping[k] = name;
    }
  }

  let additionalPropertiesType: 'default' | 'allow' | 'disallow' | 'schema' = 'default';
  let additionalPropertiesSchema = '';
  if (s.additionalProperties === true) additionalPropertiesType = 'allow';
  else if (s.additionalProperties === false) additionalPropertiesType = 'disallow';
  else if (
    typeof s.additionalProperties === 'object' &&
    s.additionalProperties !== null &&
    '$ref' in s.additionalProperties
  ) {
    additionalPropertiesType = 'schema';
    additionalPropertiesSchema =
      (s.additionalProperties as { $ref?: string }).$ref?.split('/').pop() ?? '';
  }

  let unevaluatedPropertiesType: 'default' | 'allow' | 'disallow' | 'schema' = 'default';
  let unevaluatedPropertiesSchema = '';
  if (s.unevaluatedProperties === true) unevaluatedPropertiesType = 'allow';
  else if (s.unevaluatedProperties === false) unevaluatedPropertiesType = 'disallow';
  else if (
    typeof s.unevaluatedProperties === 'object' &&
    s.unevaluatedProperties !== null &&
    '$ref' in s.unevaluatedProperties
  ) {
    unevaluatedPropertiesType = 'schema';
    unevaluatedPropertiesSchema =
      (s.unevaluatedProperties as { $ref?: string }).$ref?.split('/').pop() ?? '';
  }

  const externalDocs = s.externalDocs as { url?: string; description?: string } | undefined;

  return {
    allOf,
    oneOf,
    anyOf,
    discriminatorProperty: disc?.propertyName ?? '',
    discriminatorMapping,
    additionalPropertiesType,
    additionalPropertiesSchema,
    unevaluatedPropertiesType,
    unevaluatedPropertiesSchema,
    deprecated: Boolean(s.deprecated),
    deprecationMessage: (s.deprecationMessage as string) ?? '',
    minProperties: s.minProperties != null ? String(s.minProperties) : '',
    maxProperties: s.maxProperties != null ? String(s.maxProperties) : '',
    examples: Array.isArray(s.examples)
      ? (s.examples as unknown[]).map((ex) =>
          typeof ex === 'string' ? ex : JSON.stringify(ex)
        )
      : [],
    externalDocsUrl: externalDocs?.url ?? '',
    externalDocsDescription: externalDocs?.description ?? '',
  };
}

export const initialClassFormSchemaState: ClassFormSchemaState = {
  allOf: [],
  oneOf: [],
  anyOf: [],
  discriminatorProperty: '',
  discriminatorMapping: {},
  additionalPropertiesType: 'default',
  additionalPropertiesSchema: '',
  unevaluatedPropertiesType: 'default',
  unevaluatedPropertiesSchema: '',
  deprecated: false,
  deprecationMessage: '',
  minProperties: '',
  maxProperties: '',
  examples: [],
  externalDocsUrl: '',
  externalDocsDescription: '',
};
