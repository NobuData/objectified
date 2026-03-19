/**
 * Validation rules export (JSON) aligned with REST /export/validation-rules.
 * Used by Generate code → built-in "Validation rules (JSON)" for live canvas.
 * Reference: GitHub #122.
 */

import type { StudioClass, StudioClassProperty } from './types';

const EXPORT_KIND = 'objectified.validation-rules';
const SCHEMA_VERSION = '1.0.0';

const SCALAR_VALIDATION_KEYS = new Set([
  'type',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minContains',
  'maxContains',
  'enum',
  'const',
  'default',
  'nullable',
  'minProperties',
  'maxProperties',
  'contentEncoding',
  'contentMediaType',
]);

const ARRAY_SUFFIX_KEYS = new Set([
  'minItems',
  'maxItems',
  'uniqueItems',
  'minContains',
  'maxContains',
]);

const CONDITIONAL_KEYS = new Set([
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function effectiveClassPropertyData(p: StudioClassProperty): Record<string, unknown> {
  const pd = p.property_data;
  const d = p.data;
  const base =
    pd && typeof pd === 'object' && !Array.isArray(pd)
      ? { ...(pd as Record<string, unknown>) }
      : {};
  const over =
    d && typeof d === 'object' && !Array.isArray(d)
      ? (d as Record<string, unknown>)
      : {};
  if (Object.keys(base).length === 0) return over;
  if (Object.keys(over).length === 0) return base;
  return deepMerge(base, over);
}

function parseData(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      return isPlainObject(j) ? j : {};
    } catch {
      return {};
    }
  }
  return isPlainObject(raw) ? { ...raw } : {};
}

/** API-shaped row for openapi_generator-compatible building. */
function toPropertyRow(p: StudioClassProperty): Record<string, unknown> {
  const id = String(p.id ?? p.localId ?? '');
  return {
    id,
    class_id: p.class_id,
    property_id: p.property_id,
    parent_id: p.parent_id ?? null,
    name: p.name,
    description: p.description ?? '',
    data: effectiveClassPropertyData(p),
  };
}

function buildPropertySchema(
  prop: Record<string, unknown>,
  allProperties: Record<string, unknown>[]
): Record<string, unknown> {
  const propData = parseData(prop.data);
  const selfRequired = propData.required;

  if (prop.description) {
    propData.description = prop.description;
  } else if (propData.description == null) {
    if (propData.title) {
      propData.description = propData.title;
    } else {
      delete propData.description;
    }
  }

  const propId = String(prop.id ?? '');
  const children = allProperties.filter(
    (x) => String(x.parent_id ?? '') === propId
  );

  if (propData.type === 'object' && !propData.$ref) {
    if (children.length > 0) {
      const nestedProperties: Record<string, unknown> = {};
      const nestedRequired: string[] = [];
      for (const child of children) {
        const childSchema = buildPropertySchema(child, allProperties);
        if (childSchema.required === true) {
          nestedRequired.push(String(child.name ?? ''));
          delete childSchema.required;
        } else if (
          childSchema.required === false &&
          !Array.isArray(childSchema.required)
        ) {
          delete childSchema.required;
        }
        nestedProperties[String(child.name ?? '')] = childSchema;
      }
      propData.properties = nestedProperties;
      if (nestedRequired.length > 0) {
        propData.required = nestedRequired;
      } else if (Array.isArray(propData.required)) {
        delete propData.required;
      }
    }
  }

  if (propData.type === 'array') {
    if (children.length > 0 && !propData.items) {
      propData.items = { type: 'object' };
    }
    const items = propData.items as Record<string, unknown> | undefined;
    if (
      items &&
      !items.$ref &&
      (items.type === 'object' || children.length > 0)
    ) {
      const nestedProperties: Record<string, unknown> = {};
      const nestedRequired: string[] = [];
      for (const child of children) {
        const childSchema = buildPropertySchema(child, allProperties);
        if (childSchema.required === true) {
          nestedRequired.push(String(child.name ?? ''));
          delete childSchema.required;
        } else if (
          childSchema.required === false &&
          !Array.isArray(childSchema.required)
        ) {
          delete childSchema.required;
        }
        nestedProperties[String(child.name ?? '')] = childSchema;
      }
      propData.items = {
        ...items,
        type: 'object',
        properties: nestedProperties,
      };
      if (nestedRequired.length > 0) {
        (propData.items as Record<string, unknown>).required = nestedRequired;
      } else if ('required' in (propData.items as object)) {
        delete (propData.items as Record<string, unknown>).required;
      }
    }
  }

  if (selfRequired === true) {
    propData.required = true;
  } else if (
    selfRequired === false &&
    !Array.isArray(propData.required)
  ) {
    propData.required = false;
  }

  return propData;
}

function buildClassSchemaFromStudio(cls: StudioClass): Record<string, unknown> {
  const rawSchema =
    cls.schema && typeof cls.schema === 'object' && !Array.isArray(cls.schema)
      ? { ...cls.schema }
      : {};
  delete rawSchema.properties;
  delete rawSchema.required;

  const rows = cls.properties.map(toPropertyRow);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const topLevel = rows.filter((r) => !r.parent_id);
  for (const prop of topLevel) {
    const propSchema = buildPropertySchema(prop, rows);
    if (propSchema.required === true) {
      required.push(String(prop.name ?? ''));
      delete propSchema.required;
    } else if (propSchema.required === false) {
      delete propSchema.required;
    }
    properties[String(prop.name ?? '')] = propSchema;
  }

  const hasComposition = ['allOf', 'anyOf', 'oneOf'].some((k) => k in rawSchema);

  let classSchema: Record<string, unknown>;
  if (hasComposition) {
    classSchema = {
      description: cls.description ?? null,
      ...rawSchema,
    };
    if (Object.keys(properties).length > 0) {
      classSchema.properties = properties;
      if (required.length > 0) {
        classSchema.required = required;
      }
    }
  } else {
    classSchema = {
      type: 'object',
      description: cls.description ?? null,
      ...rawSchema,
      properties,
    };
    if (required.length > 0) {
      classSchema.required = required;
    }
  }

  if (
    classSchema.properties &&
    typeof classSchema.properties === 'object' &&
    Object.keys(classSchema.properties as object).length === 0
  ) {
    delete classSchema.properties;
  }

  return Object.fromEntries(
    Object.entries(classSchema).filter(([, v]) => v != null)
  );
}

function extractFieldRules(schema: unknown): Record<string, unknown> {
  if (!isPlainObject(schema)) {
    return {};
  }
  if ('$ref' in schema) {
    return { $ref: schema.$ref };
  }

  const out: Record<string, unknown> = {};
  for (const key of SCALAR_VALIDATION_KEYS) {
    if (key in schema && schema[key] != null) {
      out[key] = schema[key];
    }
  }

  const items = schema.items;
  if (isPlainObject(items)) {
    const extracted = extractFieldRules(items);
    if (Object.keys(extracted).length > 0) {
      out.items = extracted;
    }
  }

  const nested = schema.properties;
  if (isPlainObject(nested) && Object.keys(nested).length > 0) {
    const reqList = schema.required;
    const reqSet = Array.isArray(reqList) ? new Set(reqList.map(String)) : new Set();
    const propsOut: Record<string, unknown> = {};
    for (const [pname, ps] of Object.entries(nested)) {
      const child = extractFieldRules(ps);
      child.required = reqSet.has(pname);
      propsOut[pname] = child;
    }
    out.properties = propsOut;
    if (Array.isArray(reqList)) {
      out.requiredProperties = [...reqList];
    }
  }

  for (const key of ARRAY_SUFFIX_KEYS) {
    if (key in schema && !(key in out)) {
      out[key] = schema[key];
    }
  }

  for (const key of CONDITIONAL_KEYS) {
    if (key in schema) {
      out[key] = schema[key];
    }
  }

  return out;
}

function classValidationEntry(cls: StudioClass): Record<string, unknown> {
  const full = buildClassSchemaFromStudio(cls);
  const reqNames = (full.required as string[]) || [];
  const reqSet = new Set(reqNames);
  const propsRaw = (full.properties as Record<string, unknown>) || {};
  const propertiesOut: Record<string, unknown> = {};

  for (const [pname, pschema] of Object.entries(propsRaw)) {
    const rules = extractFieldRules(pschema);
    rules.required = reqSet.has(pname);
    propertiesOut[pname] = rules;
  }

  const entry: Record<string, unknown> = {
    name: cls.name,
    properties: propertiesOut,
  };
  const desc = full.description ?? cls.description;
  if (desc) {
    entry.description = desc;
  }
  if (reqNames.length > 0) {
    entry.required = [...reqNames];
  }
  if (cls.id) {
    entry.id = cls.id;
  }
  return entry;
}

export interface ValidationRulesExportOptions {
  versionId?: string;
  versionName?: string;
  title?: string;
}

export function generateValidationRulesExport(
  classes: StudioClass[],
  opts?: ValidationRulesExportOptions
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    exportKind: EXPORT_KIND,
    schemaVersion: SCHEMA_VERSION,
    versionId: opts?.versionId ?? 'canvas',
    versionName: opts?.versionName ?? null,
    title: opts?.title ?? opts?.versionName ?? 'Validation rules',
    classes: classes.map(classValidationEntry),
  };
  return Object.fromEntries(
    Object.entries(doc).filter(([, v]) => v != null)
  );
}

export function formatValidationRulesJson(classes: StudioClass[], opts?: ValidationRulesExportOptions): string {
  return `${JSON.stringify(generateValidationRulesExport(classes, opts), null, 2)}\n`;
}
