/**
 * Property schema utilities for JSON Schema 2020-12 / OpenAPI 3.2.0.
 * Provides form data types, schema building, and parsing for the property dialog.
 * Reference: GitHub #104, #106 (stringConstraints), #107 (numberConstraints), #108 (arrayConstraints, tupleMode).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PropertyFormData {
  $ref?: string;
  title?: string;
  description?: string;
  format?: string;
  pattern?: string;

  minLength?: string;
  maxLength?: string;

  minimum?: string;
  maximum?: string;
  minimumType?: 'inclusive' | 'exclusive';
  maximumType?: 'inclusive' | 'exclusive';
  multipleOf?: string;

  minItems?: string;
  maxItems?: string;
  uniqueItems?: boolean;
  contains?: string;
  minContains?: string;
  maxContains?: string;

  tupleMode?: boolean;
  prefixItems?: any[];
  itemsSchema?: string;
  /** Optional custom items schema (JSON) for non-tuple arrays. When set, used as schema.items instead of building from base type. */
  itemsSchemaOverride?: string;

  unevaluatedItems?: 'default' | 'allow' | 'disallow' | 'schema';
  unevaluatedItemsSchema?: string;

  enum?: string[];
  const?: string;
  default?: string;

  not?: string;

  required?: boolean;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  deprecationMessage?: string;
  examples?: string[];

  additionalProperties?: 'default' | 'true' | 'false' | 'type' | 'schema';
  additionalPropertiesType?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  additionalPropertiesSchema?: string;
  minProperties?: string;
  maxProperties?: string;
  patternProperties?: Record<string, any>;
  propertyNamesPattern?: string;
  propertyNamesMinLength?: string;
  propertyNamesMaxLength?: string;
  propertyNamesFormat?: string;
  propertyNamesDescription?: string;

  dependentSchemas?: Record<string, any>;

  unevaluatedProperties?: 'default' | 'allow' | 'disallow' | 'schema';
  unevaluatedPropertiesSchema?: string;

  extensions?: Record<string, any>;

  externalDocsUrl?: string;
  externalDocsDescription?: string;

  xmlName?: string;
  xmlNamespace?: string;
  xmlPrefix?: string;
  xmlAttribute?: boolean;
  xmlWrapped?: boolean;

  contentMediaType?: string;
  contentEncoding?: string;
  contentSchema?: string;

  $comment?: string;
}

export const PROPERTY_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'null',
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];

export const FORMAT_OPTIONS: Record<string, { value: string; label: string; description: string }[]> = {
  string: [
    { value: 'date', label: 'date', description: 'Full date (RFC 3339)' },
    { value: 'date-time', label: 'date-time', description: 'Date and time (RFC 3339)' },
    { value: 'time', label: 'time', description: 'Time only (RFC 3339)' },
    { value: 'duration', label: 'duration', description: 'Duration (ISO 8601)' },
    { value: 'email', label: 'email', description: 'Email address (RFC 5321)' },
    { value: 'idn-email', label: 'idn-email', description: 'Internationalized email' },
    { value: 'hostname', label: 'hostname', description: 'Internet hostname' },
    { value: 'idn-hostname', label: 'idn-hostname', description: 'Internationalized hostname' },
    { value: 'ipv4', label: 'ipv4', description: 'IPv4 address' },
    { value: 'ipv6', label: 'ipv6', description: 'IPv6 address' },
    { value: 'uri', label: 'uri', description: 'Uniform Resource Identifier' },
    { value: 'uri-reference', label: 'uri-reference', description: 'URI or relative reference' },
    { value: 'iri', label: 'iri', description: 'Internationalized URI' },
    { value: 'iri-reference', label: 'iri-reference', description: 'IRI or relative reference' },
    { value: 'uri-template', label: 'uri-template', description: 'URI Template (RFC 6570)' },
    { value: 'uuid', label: 'uuid', description: 'UUID (RFC 4122)' },
    { value: 'json-pointer', label: 'json-pointer', description: 'JSON Pointer (RFC 6901)' },
    { value: 'relative-json-pointer', label: 'relative-json-pointer', description: 'Relative JSON Pointer' },
    { value: 'regex', label: 'regex', description: 'Regular expression' },
    { value: 'password', label: 'password', description: 'Password (UI hint to obscure)' },
    { value: 'byte', label: 'byte', description: 'Base64-encoded binary' },
    { value: 'binary', label: 'binary', description: 'Binary data (any octets)' },
  ],
  integer: [
    { value: 'int32', label: 'int32', description: 'Signed 32-bit integer' },
    { value: 'int64', label: 'int64', description: 'Signed 64-bit integer (long)' },
  ],
  number: [
    { value: 'float', label: 'float', description: 'Single-precision float' },
    { value: 'double', label: 'double', description: 'Double-precision float' },
  ],
};

function tryParseJson(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normaliseRefValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('$ref:')) return trimmed.replace(/^\$ref:\s*/, '');
  if (trimmed.startsWith('#/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (/^[A-Za-z_][A-Za-z0-9_./-]*$/.test(trimmed)) {
    return `#/components/schemas/${trimmed}`;
  }
  return undefined;
}

function applyMinMax(target: any, formData: PropertyFormData): void {
  if (formData.minimum && formData.minimum.trim()) {
    const minValue = parseFloat(formData.minimum);
    if (!isNaN(minValue)) {
      if (formData.minimumType === 'exclusive') {
        target.exclusiveMinimum = minValue;
      } else {
        target.minimum = minValue;
      }
    }
  }
  if (formData.maximum && formData.maximum.trim()) {
    const maxValue = parseFloat(formData.maximum);
    if (!isNaN(maxValue)) {
      if (formData.maximumType === 'exclusive') {
        target.exclusiveMaximum = maxValue;
      } else {
        target.maximum = maxValue;
      }
    }
  }
  if (formData.multipleOf && formData.multipleOf.trim()) {
    const multipleOfValue = parseFloat(formData.multipleOf);
    if (!isNaN(multipleOfValue) && multipleOfValue > 0) {
      target.multipleOf = multipleOfValue;
    }
  }
}

/** Apply string constraints (format, pattern, minLength, maxLength). Reference: GitHub #106 stringConstraints. */
function applyStringConstraints(target: any, formData: PropertyFormData): void {
  if (formData.format) target.format = formData.format;
  if (formData.pattern) target.pattern = formData.pattern;
  if (formData.minLength) {
    const v = parseInt(formData.minLength);
    if (!isNaN(v)) target.minLength = v;
  }
  if (formData.maxLength) {
    const v = parseInt(formData.maxLength);
    if (!isNaN(v)) target.maxLength = v;
  }
}

function applyConstOrEnum(
  target: any,
  formData: PropertyFormData,
  propertyType?: string,
): void {
  const isNumeric = propertyType === 'number' || propertyType === 'integer';
  if (formData.const && formData.const.trim()) {
    let parsed = tryParseJson(formData.const);
    if (isNumeric && (typeof parsed !== 'number' || isNaN(parsed))) {
      const n = Number(String(parsed));
      if (!isNaN(n)) {
        if (propertyType === 'integer') {
          if (Number.isInteger(n)) parsed = n;
        } else {
          parsed = n;
        }
      }
    }
    target.const = parsed;
  } else if (formData.enum && formData.enum.length > 0) {
    if (isNumeric) {
      target.enum = formData.enum
        .map((s) => {
          const parsed = tryParseJson(s);
          const n = typeof parsed === 'number' ? parsed : Number(s);
          if (isNaN(n)) return undefined;
          if (propertyType === 'integer' && !Number.isInteger(n)) return undefined;
          return n;
        })
        .filter((v): v is number => v !== undefined);
    } else {
      target.enum = formData.enum;
    }
  }
  if (formData.default && formData.default.trim()) {
    if (isNumeric) {
      const parsed = tryParseJson(formData.default);
      const n = typeof parsed === 'number' ? parsed : Number(formData.default);
      if (!isNaN(n)) {
        if (propertyType === 'integer') {
          if (Number.isInteger(n)) target.default = n;
        } else {
          target.default = n;
        }
      }
    } else {
      target.default = formData.default;
    }
  }
}

function applyObjectConstraints(target: any, formData: PropertyFormData): void {
  if (formData.additionalProperties === 'true') {
    target.additionalProperties = true;
  } else if (formData.additionalProperties === 'false') {
    target.additionalProperties = false;
  } else if (formData.additionalProperties === 'type' && formData.additionalPropertiesType) {
    target.additionalProperties = { type: formData.additionalPropertiesType };
  } else if (formData.additionalProperties === 'schema' && formData.additionalPropertiesSchema) {
    const schemaValue = formData.additionalPropertiesSchema.trim();
    if (schemaValue.startsWith('{')) {
      try {
        target.additionalProperties = JSON.parse(schemaValue);
      } catch {
        // JSON parse failed — only use as class name if it's a valid identifier
        // (otherwise the input is invalid JSON and not usable as a $ref)
      }
    } else if (schemaValue.startsWith('#/') || schemaValue.startsWith('$ref')) {
      target.additionalProperties = { $ref: schemaValue };
    } else if (/^[A-Za-z_][A-Za-z0-9_./-]*$/.test(schemaValue)) {
      // Treat as a class / component schema name
      target.additionalProperties = { $ref: `#/components/schemas/${schemaValue}` };
    }
  }

  if (formData.minProperties) {
    const v = parseInt(formData.minProperties);
    if (!isNaN(v)) target.minProperties = v;
  }
  if (formData.maxProperties) {
    const v = parseInt(formData.maxProperties);
    if (!isNaN(v)) target.maxProperties = v;
  }

  if (formData.patternProperties && Object.keys(formData.patternProperties).length > 0) {
    target.patternProperties = formData.patternProperties;
  }

  if (formData.dependentSchemas && Object.keys(formData.dependentSchemas).length > 0) {
    target.dependentSchemas = formData.dependentSchemas;
  }

  const hasPropertyNames = formData.propertyNamesPattern || formData.propertyNamesMinLength
    || formData.propertyNamesMaxLength || formData.propertyNamesFormat || formData.propertyNamesDescription;
  if (hasPropertyNames) {
    target.propertyNames = { type: 'string' } as any;
    if (formData.propertyNamesPattern) target.propertyNames.pattern = formData.propertyNamesPattern;
    if (formData.propertyNamesMinLength) {
      const v = parseInt(formData.propertyNamesMinLength);
      if (!isNaN(v)) target.propertyNames.minLength = v;
    }
    if (formData.propertyNamesMaxLength) {
      const v = parseInt(formData.propertyNamesMaxLength);
      if (!isNaN(v)) target.propertyNames.maxLength = v;
    }
    if (formData.propertyNamesFormat) target.propertyNames.format = formData.propertyNamesFormat;
    if (formData.propertyNamesDescription) target.propertyNames.description = formData.propertyNamesDescription;
  }

  if (formData.unevaluatedProperties === 'allow') {
    target.unevaluatedProperties = true;
  } else if (formData.unevaluatedProperties === 'disallow') {
    target.unevaluatedProperties = false;
  } else if (formData.unevaluatedProperties === 'schema' && formData.unevaluatedPropertiesSchema?.trim()) {
    target.unevaluatedProperties = tryParseJson(formData.unevaluatedPropertiesSchema);
  }
}

function applyNotComposition(target: any, formData: PropertyFormData): void {
  if (formData.not && formData.not.trim()) {
    target.not = tryParseJson(formData.not);
  }
}

/**
 * Build a JSON Schema object from form data, property type, and array flag.
 */
export function buildPropertySchema(
  formData: PropertyFormData,
  propertyType: string,
  isArray: boolean,
): Record<string, any> {
  const schema: Record<string, any> = {};
  const refValue = normaliseRefValue(formData.$ref);

  if (formData.title) schema.title = formData.title;
  if (formData.description) schema.description = formData.description;
  if (formData.readOnly) schema.readOnly = true;
  if (formData.writeOnly) schema.writeOnly = true;
  if (formData.deprecated) {
    schema.deprecated = true;
    if (formData.deprecationMessage?.trim()) {
      schema['x-deprecation-message'] = formData.deprecationMessage.trim();
    }
  }
  if (formData.examples && formData.examples.length > 0) {
    schema.examples = formData.examples.map((ex) => tryParseJson(ex));
  }
  // `required` is tracked as x-required since JSON Schema's `required` is a parent-object array,
  // not a boolean on the individual property schema.
  if (formData.required) schema['x-required'] = true;

  if (isArray) {
    schema.type = formData.nullable ? ['array', 'null'] : 'array';
    if (formData.minItems) {
      const v = parseInt(formData.minItems);
      if (!isNaN(v)) schema.minItems = v;
    }
    if (formData.maxItems) {
      const v = parseInt(formData.maxItems);
      if (!isNaN(v)) schema.maxItems = v;
    }
    if (formData.uniqueItems) schema.uniqueItems = true;

    if (formData.contains && formData.contains.trim()) {
      schema.contains = tryParseJson(formData.contains);
      if (typeof schema.contains === 'string') {
        schema.contains = { type: schema.contains };
      }
      if (formData.minContains) {
        const mc = parseInt(formData.minContains);
        if (!isNaN(mc) && mc >= 1) schema.minContains = mc;
      }
      if (formData.maxContains) {
        const mc = parseInt(formData.maxContains);
        if (!isNaN(mc) && mc >= 1) schema.maxContains = mc;
      }
    }

    if (formData.unevaluatedItems === 'allow') {
      schema.unevaluatedItems = true;
    } else if (formData.unevaluatedItems === 'disallow') {
      schema.unevaluatedItems = false;
    } else if (formData.unevaluatedItems === 'schema' && formData.unevaluatedItemsSchema?.trim()) {
      schema.unevaluatedItems = tryParseJson(formData.unevaluatedItemsSchema);
    }

    if (formData.tupleMode && formData.prefixItems && formData.prefixItems.length > 0) {
      schema.prefixItems = formData.prefixItems;
      if (formData.itemsSchema && formData.itemsSchema.trim()) {
        schema.items = tryParseJson(formData.itemsSchema);
      } else {
        schema.items = true;
      }
    } else if (refValue) {
      schema.items = { $ref: refValue };
    } else if (formData.itemsSchemaOverride && formData.itemsSchemaOverride.trim()) {
      const parsed = tryParseJson(formData.itemsSchemaOverride);
      if (typeof parsed === 'object' && parsed !== null) {
        schema.items = parsed;
      } else if (parsed === true || parsed === false) {
        schema.items = parsed;
      } else {
        const itemsSchema: any = { type: propertyType };
        if (propertyType === 'string') applyStringConstraints(itemsSchema, formData);
        if (propertyType === 'number' || propertyType === 'integer') {
          if (formData.format) itemsSchema.format = formData.format;
          applyMinMax(itemsSchema, formData);
        }
        applyConstOrEnum(itemsSchema, formData, propertyType);
        if (propertyType === 'object') applyObjectConstraints(itemsSchema, formData);
        applyNotComposition(itemsSchema, formData);
        schema.items = itemsSchema;
      }
    } else {
      const itemsSchema: any = { type: propertyType };
      if (propertyType === 'string') {
        applyStringConstraints(itemsSchema, formData);
      }
      if (propertyType === 'number' || propertyType === 'integer') {
        if (formData.format) itemsSchema.format = formData.format;
        applyMinMax(itemsSchema, formData);
      }
      applyConstOrEnum(itemsSchema, formData, propertyType);
      if (propertyType === 'object') {
        applyObjectConstraints(itemsSchema, formData);
      }
      applyNotComposition(itemsSchema, formData);
      schema.items = itemsSchema;
    }
  } else {
    if (refValue) {
      if (formData.nullable) {
        schema.anyOf = [{ $ref: refValue }, { type: 'null' }];
      } else {
        schema.$ref = refValue;
      }
    } else {
      schema.type = formData.nullable ? [propertyType, 'null'] : propertyType;
      if (propertyType === 'string') {
        applyStringConstraints(schema, formData);
      }
      if (propertyType === 'number' || propertyType === 'integer') {
        if (formData.format) schema.format = formData.format;
        applyMinMax(schema, formData);
      }
      applyConstOrEnum(schema, formData, propertyType);
      if (propertyType === 'object') {
        applyObjectConstraints(schema, formData);
      }
      applyNotComposition(schema, formData);
    }
  }

  // XML Object (OpenAPI 3.1)
  const hasXml = formData.xmlName || formData.xmlNamespace || formData.xmlPrefix
    || formData.xmlAttribute || formData.xmlWrapped;
  if (hasXml) {
    schema.xml = {} as any;
    if (formData.xmlName) schema.xml.name = formData.xmlName;
    if (formData.xmlNamespace) schema.xml.namespace = formData.xmlNamespace;
    if (formData.xmlPrefix) schema.xml.prefix = formData.xmlPrefix;
    if (formData.xmlAttribute) schema.xml.attribute = true;
    if (formData.xmlWrapped) schema.xml.wrapped = true;
  }

  // Content Media Type (OpenAPI 3.1)
  if (formData.contentMediaType) schema.contentMediaType = formData.contentMediaType;
  if (formData.contentEncoding) schema.contentEncoding = formData.contentEncoding;
  if (formData.contentSchema && formData.contentSchema.trim()) {
    schema.contentSchema = tryParseJson(formData.contentSchema);
  }

  // $comment (JSON Schema 2020-12)
  if (formData.$comment) schema.$comment = formData.$comment;

  // Extensions (x- prefixed)
  if (formData.extensions && Object.keys(formData.extensions).length > 0) {
    Object.assign(schema, formData.extensions);
  }

  // External Documentation
  if (formData.externalDocsUrl?.trim()) {
    schema.externalDocs = { url: formData.externalDocsUrl.trim() };
    if (formData.externalDocsDescription?.trim()) {
      schema.externalDocs.description = formData.externalDocsDescription.trim();
    }
  }

  return schema;
}

/**
 * Parse a JSON Schema object into PropertyFormData, propertyType, and isArray flag.
 */
export function parsePropertySchema(
  schemaData: Record<string, any>,
): { formData: PropertyFormData; propertyType: string; isArray: boolean } {
  const formData: PropertyFormData = {};
  let propertyType = 'string';
  let isArray = false;
  let extractedRef: string | undefined;

  const typeValue = schemaData.type;
  let isNullable = false;
  let actualType = typeValue;

  if (typeof schemaData.$ref === 'string' && schemaData.$ref.trim()) {
    extractedRef = schemaData.$ref;
  }
  if (Array.isArray(schemaData.anyOf)) {
    const anyOfRef = schemaData.anyOf.find(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).$ref === 'string'
    ) as { $ref?: string } | undefined;
    if (anyOfRef?.$ref?.trim()) {
      extractedRef = anyOfRef.$ref;
      isNullable = schemaData.anyOf.some(
        (entry: unknown) =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as Record<string, unknown>).type === 'null'
      );
    }
  }

  if (Array.isArray(typeValue)) {
    isNullable = typeValue.includes('null');
    actualType = typeValue.find((t: string) => t !== 'null') || 'string';
  }

  isArray = actualType === 'array';

  const hasTupleMode = schemaData.prefixItems && Array.isArray(schemaData.prefixItems);

  if (isArray && hasTupleMode) {
    propertyType = 'string';
  } else if (isArray && schemaData.items && typeof schemaData.items === 'object') {
    propertyType = schemaData.items.type || (schemaData.items.$ref ? 'object' : 'string');
    if (typeof schemaData.items.$ref === 'string' && schemaData.items.$ref.trim()) {
      extractedRef = schemaData.items.$ref;
    }
  } else if (!isArray) {
    propertyType = actualType || (extractedRef ? 'object' : 'string');
  }

  const constraintSource = (isArray && !hasTupleMode && schemaData.items && typeof schemaData.items === 'object')
    ? schemaData.items
    : schemaData;

  formData.title = schemaData.title || '';
  formData.description = schemaData.description || '';
  formData.nullable = isNullable;
  formData.$ref = extractedRef || '';

  // String constraints
  formData.format = constraintSource.format || '';
  formData.pattern = constraintSource.pattern || '';
  formData.minLength = constraintSource.minLength?.toString() || '';
  formData.maxLength = constraintSource.maxLength?.toString() || '';

  // Number constraints
  if (constraintSource.exclusiveMinimum !== undefined) {
    formData.minimum = constraintSource.exclusiveMinimum.toString();
    formData.minimumType = 'exclusive';
  } else if (constraintSource.minimum !== undefined) {
    formData.minimum = constraintSource.minimum.toString();
    formData.minimumType = 'inclusive';
  } else {
    formData.minimum = '';
  }

  if (constraintSource.exclusiveMaximum !== undefined) {
    formData.maximum = constraintSource.exclusiveMaximum.toString();
    formData.maximumType = 'exclusive';
  } else if (constraintSource.maximum !== undefined) {
    formData.maximum = constraintSource.maximum.toString();
    formData.maximumType = 'inclusive';
  } else {
    formData.maximum = '';
  }

  formData.multipleOf = constraintSource.multipleOf?.toString() || '';

  // Array constraints
  formData.minItems = schemaData.minItems?.toString() || '';
  formData.maxItems = schemaData.maxItems?.toString() || '';
  formData.uniqueItems = schemaData.uniqueItems || false;
  formData.contains = schemaData.contains ? JSON.stringify(schemaData.contains, null, 2) : '';
  formData.minContains = schemaData.minContains?.toString() || '';
  formData.maxContains = schemaData.maxContains?.toString() || '';

  // Tuple mode
  formData.tupleMode = !!hasTupleMode;
  formData.prefixItems = schemaData.prefixItems || [];
  formData.itemsSchema = hasTupleMode && schemaData.items !== undefined
    ? (typeof schemaData.items === 'object' ? JSON.stringify(schemaData.items, null, 2) : String(schemaData.items))
    : '';

  // Items schema override (non-tuple): when items is a custom object (no $ref), preserve for round-trip
  if (isArray && !hasTupleMode && schemaData.items && typeof schemaData.items === 'object' && !schemaData.items.$ref) {
    formData.itemsSchemaOverride = JSON.stringify(schemaData.items, null, 2);
  } else {
    formData.itemsSchemaOverride = '';
  }

  // Unevaluated items
  if (schemaData.unevaluatedItems === true) {
    formData.unevaluatedItems = 'allow';
  } else if (schemaData.unevaluatedItems === false) {
    formData.unevaluatedItems = 'disallow';
  } else if (typeof schemaData.unevaluatedItems === 'object') {
    formData.unevaluatedItems = 'schema';
    formData.unevaluatedItemsSchema = JSON.stringify(schemaData.unevaluatedItems, null, 2);
  } else {
    formData.unevaluatedItems = 'default';
  }

  // Enum / const / default (enum normalized to string[] for form)
  formData.enum = (constraintSource.enum || []).map((v: any) => typeof v === 'string' ? v : JSON.stringify(v));
  formData.const = constraintSource.const !== undefined
    ? (typeof constraintSource.const === 'string' ? constraintSource.const : JSON.stringify(constraintSource.const))
    : '';
  formData.default = constraintSource.default?.toString() || '';

  // Metadata
  formData.required = schemaData['x-required'] || false;
  formData.readOnly = schemaData.readOnly || false;
  formData.writeOnly = schemaData.writeOnly || false;
  formData.deprecated = schemaData.deprecated || false;
  formData.deprecationMessage = schemaData['x-deprecation-message'] || schemaData.deprecationMessage || '';
  formData.examples = schemaData.examples
    ? schemaData.examples.map((ex: any) => (typeof ex === 'string' ? ex : JSON.stringify(ex)))
    : [];

  // Object constraints
  if (constraintSource.hasOwnProperty('additionalProperties')) {
    if (constraintSource.additionalProperties === true) {
      formData.additionalProperties = 'true';
    } else if (constraintSource.additionalProperties === false) {
      formData.additionalProperties = 'false';
    } else if (typeof constraintSource.additionalProperties === 'object' && constraintSource.additionalProperties.$ref) {
      formData.additionalProperties = 'schema';
      const refPath = constraintSource.additionalProperties.$ref;
      formData.additionalPropertiesSchema = refPath.split('/').pop() || refPath;
    } else if (typeof constraintSource.additionalProperties === 'object' && constraintSource.additionalProperties.type) {
      formData.additionalProperties = 'type';
      formData.additionalPropertiesType = constraintSource.additionalProperties.type;
    } else if (typeof constraintSource.additionalProperties === 'object') {
      formData.additionalProperties = 'schema';
      formData.additionalPropertiesSchema = JSON.stringify(constraintSource.additionalProperties);
    }
  } else {
    formData.additionalProperties = 'default';
  }

  formData.minProperties = constraintSource.minProperties?.toString() || '';
  formData.maxProperties = constraintSource.maxProperties?.toString() || '';
  formData.patternProperties = constraintSource.patternProperties || undefined;
  formData.dependentSchemas = constraintSource.dependentSchemas || undefined;

  // Property names
  formData.propertyNamesPattern = constraintSource.propertyNames?.pattern || '';
  formData.propertyNamesMinLength = constraintSource.propertyNames?.minLength?.toString() || '';
  formData.propertyNamesMaxLength = constraintSource.propertyNames?.maxLength?.toString() || '';
  formData.propertyNamesFormat = constraintSource.propertyNames?.format || '';
  formData.propertyNamesDescription = constraintSource.propertyNames?.description || '';

  // Unevaluated properties
  if (constraintSource.unevaluatedProperties === true) {
    formData.unevaluatedProperties = 'allow';
  } else if (constraintSource.unevaluatedProperties === false) {
    formData.unevaluatedProperties = 'disallow';
  } else if (typeof constraintSource.unevaluatedProperties === 'object') {
    formData.unevaluatedProperties = 'schema';
    formData.unevaluatedPropertiesSchema = JSON.stringify(constraintSource.unevaluatedProperties, null, 2);
  } else {
    formData.unevaluatedProperties = 'default';
  }

  // NOT composition
  formData.not = constraintSource.not ? JSON.stringify(constraintSource.not, null, 2) : '';

  // Extensions
  const extensions: Record<string, any> = {};
  Object.keys(schemaData).forEach((key) => {
    if (key.startsWith('x-') && key !== 'x-deprecation-message') {
      extensions[key] = schemaData[key];
    }
  });
  formData.extensions = Object.keys(extensions).length > 0 ? extensions : undefined;

  // External docs
  formData.externalDocsUrl = schemaData.externalDocs?.url || '';
  formData.externalDocsDescription = schemaData.externalDocs?.description || '';

  // XML
  formData.xmlName = schemaData.xml?.name || '';
  formData.xmlNamespace = schemaData.xml?.namespace || '';
  formData.xmlPrefix = schemaData.xml?.prefix || '';
  formData.xmlAttribute = schemaData.xml?.attribute || false;
  formData.xmlWrapped = schemaData.xml?.wrapped || false;

  // Content media type
  formData.contentMediaType = schemaData.contentMediaType || '';
  formData.contentEncoding = schemaData.contentEncoding || '';
  formData.contentSchema = schemaData.contentSchema
    ? JSON.stringify(schemaData.contentSchema, null, 2)
    : '';

  // $comment
  formData.$comment = schemaData.$comment || '';

  return { formData, propertyType, isArray };
}
