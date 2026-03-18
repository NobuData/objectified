/**
 * Extensive tests for propertySchemaUtils: buildPropertySchema, parsePropertySchema, FORMAT_OPTIONS.
 * Reference: GitHub #104
 */

import {
  buildPropertySchema,
  parsePropertySchema,
  FORMAT_OPTIONS,
  PROPERTY_TYPES,
  type PropertyFormData,
} from '@/app/dashboard/utils/propertySchemaUtils';

describe('propertySchemaUtils', () => {
  describe('PROPERTY_TYPES', () => {
    it('contains JSON Schema 2020-12 primitive types (array is excluded; use isArray toggle)', () => {
      expect(PROPERTY_TYPES).toContain('string');
      expect(PROPERTY_TYPES).toContain('number');
      expect(PROPERTY_TYPES).toContain('integer');
      expect(PROPERTY_TYPES).toContain('boolean');
      expect(PROPERTY_TYPES).toContain('object');
      expect(PROPERTY_TYPES).not.toContain('array');
      expect(PROPERTY_TYPES).toContain('null');
    });
  });

  describe('FORMAT_OPTIONS', () => {
    it('provides string formats per OpenAPI 3.1 / JSON Schema 2020-12', () => {
      const stringFormats = FORMAT_OPTIONS.string.map((f) => f.value);
      expect(stringFormats).toContain('date');
      expect(stringFormats).toContain('date-time');
      expect(stringFormats).toContain('time');
      expect(stringFormats).toContain('duration');
      expect(stringFormats).toContain('email');
      expect(stringFormats).toContain('idn-email');
      expect(stringFormats).toContain('hostname');
      expect(stringFormats).toContain('ipv4');
      expect(stringFormats).toContain('ipv6');
      expect(stringFormats).toContain('uri');
      expect(stringFormats).toContain('uri-reference');
      expect(stringFormats).toContain('iri');
      expect(stringFormats).toContain('iri-reference');
      expect(stringFormats).toContain('uri-template');
      expect(stringFormats).toContain('uuid');
      expect(stringFormats).toContain('json-pointer');
      expect(stringFormats).toContain('relative-json-pointer');
      expect(stringFormats).toContain('regex');
      expect(stringFormats).toContain('password');
      expect(stringFormats).toContain('byte');
      expect(stringFormats).toContain('binary');
    });

    it('provides integer formats', () => {
      const intFormats = FORMAT_OPTIONS.integer.map((f) => f.value);
      expect(intFormats).toContain('int32');
      expect(intFormats).toContain('int64');
    });

    it('provides number formats', () => {
      const numFormats = FORMAT_OPTIONS.number.map((f) => f.value);
      expect(numFormats).toContain('float');
      expect(numFormats).toContain('double');
    });

    it('each format option has value, label, and description', () => {
      Object.values(FORMAT_OPTIONS).forEach((formats) => {
        formats.forEach((f) => {
          expect(f.value).toBeTruthy();
          expect(f.label).toBeTruthy();
          expect(f.description).toBeTruthy();
        });
      });
    });
  });

  describe('buildPropertySchema', () => {
    it('builds a minimal string schema', () => {
      const result = buildPropertySchema({}, 'string', false);
      expect(result).toEqual({ type: 'string' });
    });

    it('builds a minimal number schema', () => {
      const result = buildPropertySchema({}, 'number', false);
      expect(result).toEqual({ type: 'number' });
    });

    it('builds a minimal integer schema', () => {
      const result = buildPropertySchema({}, 'integer', false);
      expect(result).toEqual({ type: 'integer' });
    });

    it('builds a minimal boolean schema', () => {
      const result = buildPropertySchema({}, 'boolean', false);
      expect(result).toEqual({ type: 'boolean' });
    });

    it('builds a minimal null schema', () => {
      const result = buildPropertySchema({}, 'null', false);
      expect(result).toEqual({ type: 'null' });
    });

    it('builds a minimal object schema', () => {
      const result = buildPropertySchema({}, 'object', false);
      expect(result).toEqual({ type: 'object' });
    });

    it('builds a direct $ref schema', () => {
      const result = buildPropertySchema({ $ref: '#/components/schemas/Address' }, 'object', false);
      expect(result).toEqual({ $ref: '#/components/schemas/Address' });
    });

    it('strips the "$ref:" prefix from a $ref value', () => {
      const result = buildPropertySchema({ $ref: '$ref: #/components/schemas/Address' }, 'object', false);
      expect(result).toEqual({ $ref: '#/components/schemas/Address' });
    });

    it('strips "$ref:" prefix without leading space', () => {
      const result = buildPropertySchema({ $ref: '$ref:#/components/schemas/Address' }, 'object', false);
      expect(result).toEqual({ $ref: '#/components/schemas/Address' });
    });

    it('builds a nullable $ref schema as anyOf', () => {
      const result = buildPropertySchema(
        { $ref: '#/components/schemas/Address', nullable: true },
        'object',
        false,
      );
      expect(result.anyOf).toEqual([
        { $ref: '#/components/schemas/Address' },
        { type: 'null' },
      ]);
      expect(result.type).toBeUndefined();
    });

    it('builds an array of $ref items', () => {
      const result = buildPropertySchema(
        { $ref: '#/components/schemas/Address' },
        'object',
        true,
      );
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ $ref: '#/components/schemas/Address' });
    });

    // Title and description
    it('includes title when set', () => {
      const result = buildPropertySchema({ title: 'User ID' }, 'string', false);
      expect(result.title).toBe('User ID');
    });

    it('includes description when set', () => {
      const result = buildPropertySchema({ description: 'The user identifier' }, 'string', false);
      expect(result.description).toBe('The user identifier');
    });

    // String constraints
    it('applies string format', () => {
      const result = buildPropertySchema({ format: 'email' }, 'string', false);
      expect(result.format).toBe('email');
    });

    it('applies string pattern', () => {
      const result = buildPropertySchema({ pattern: '^[a-z]+$' }, 'string', false);
      expect(result.pattern).toBe('^[a-z]+$');
    });

    it('applies minLength and maxLength', () => {
      const result = buildPropertySchema({ minLength: '3', maxLength: '50' }, 'string', false);
      expect(result.minLength).toBe(3);
      expect(result.maxLength).toBe(50);
    });

    // Number constraints - inclusive
    it('applies inclusive minimum and maximum', () => {
      const result = buildPropertySchema(
        { minimum: '0', maximum: '100', minimumType: 'inclusive', maximumType: 'inclusive' },
        'number',
        false,
      );
      expect(result.minimum).toBe(0);
      expect(result.maximum).toBe(100);
      expect(result.exclusiveMinimum).toBeUndefined();
      expect(result.exclusiveMaximum).toBeUndefined();
    });

    // Number constraints - exclusive
    it('applies exclusive minimum and maximum', () => {
      const result = buildPropertySchema(
        { minimum: '0', maximum: '100', minimumType: 'exclusive', maximumType: 'exclusive' },
        'number',
        false,
      );
      expect(result.exclusiveMinimum).toBe(0);
      expect(result.exclusiveMaximum).toBe(100);
      expect(result.minimum).toBeUndefined();
      expect(result.maximum).toBeUndefined();
    });

    it('applies multipleOf', () => {
      const result = buildPropertySchema({ multipleOf: '0.01' }, 'number', false);
      expect(result.multipleOf).toBe(0.01);
    });

    it('ignores multipleOf when zero', () => {
      const result = buildPropertySchema({ multipleOf: '0' }, 'number', false);
      expect(result.multipleOf).toBeUndefined();
    });

    it('applies number/integer format (int32, int64, float, double)', () => {
      expect(buildPropertySchema({ format: 'int32' }, 'integer', false).format).toBe('int32');
      expect(buildPropertySchema({ format: 'int64' }, 'integer', false).format).toBe('int64');
      expect(buildPropertySchema({ format: 'float' }, 'number', false).format).toBe('float');
      expect(buildPropertySchema({ format: 'double' }, 'number', false).format).toBe('double');
    });

    it('coerces default to number for number type', () => {
      const result = buildPropertySchema({ default: '42.5' }, 'number', false);
      expect(result.default).toBe(42.5);
    });

    it('coerces default to integer for integer type', () => {
      const result = buildPropertySchema({ default: '42' }, 'integer', false);
      expect(result.default).toBe(42);
    });

    it('ignores non-integer default for integer type (does not truncate)', () => {
      const result = buildPropertySchema({ default: '2.9' }, 'integer', false);
      expect(result.default).toBeUndefined();
    });

    it('ignores NaN default for number type', () => {
      const result = buildPropertySchema({ default: 'abc' }, 'number', false);
      expect(result.default).toBeUndefined();
    });

    it('coerces enum to numbers for number type', () => {
      const result = buildPropertySchema(
        { enum: ['1', '2.5', '3'] },
        'number',
        false,
      );
      expect(result.enum).toEqual([1, 2.5, 3]);
    });

    it('coerces enum to integers for integer type', () => {
      const result = buildPropertySchema(
        { enum: ['1', '2', '3'] },
        'integer',
        false,
      );
      expect(result.enum).toEqual([1, 2, 3]);
    });

    it('filters out invalid (NaN) enum values for number type instead of defaulting to 0', () => {
      const result = buildPropertySchema(
        { enum: ['1', 'foo', '3'] },
        'number',
        false,
      );
      expect(result.enum).toEqual([1, 3]);
    });

    it('filters out non-integer enum values for integer type instead of truncating', () => {
      const result = buildPropertySchema(
        { enum: ['1', '2.5', '3'] },
        'integer',
        false,
      );
      expect(result.enum).toEqual([1, 3]);
    });

    it('filters out invalid (NaN) enum values for integer type', () => {
      const result = buildPropertySchema(
        { enum: ['1', 'bar', '3'] },
        'integer',
        false,
      );
      expect(result.enum).toEqual([1, 3]);
    });

    // Nullable
    it('makes a type nullable with array notation', () => {
      const result = buildPropertySchema({ nullable: true }, 'string', false);
      expect(result.type).toEqual(['string', 'null']);
    });

    it('makes an array type nullable', () => {
      const result = buildPropertySchema({ nullable: true }, 'string', true);
      expect(result.type).toEqual(['array', 'null']);
    });

    // Required and metadata flags
    it('encodes required as x-required extension (not as boolean in property schema)', () => {
      const result = buildPropertySchema({ required: true }, 'string', false);
      expect(result['x-required']).toBe(true);
      expect(result.required).toBeUndefined();
    });

    it('sets readOnly flag', () => {
      const result = buildPropertySchema({ readOnly: true }, 'string', false);
      expect(result.readOnly).toBe(true);
    });

    it('sets writeOnly flag', () => {
      const result = buildPropertySchema({ writeOnly: true }, 'string', false);
      expect(result.writeOnly).toBe(true);
    });

    it('sets deprecated flag with deprecation message', () => {
      const result = buildPropertySchema(
        { deprecated: true, deprecationMessage: 'Use newField instead' },
        'string',
        false,
      );
      expect(result.deprecated).toBe(true);
      expect(result['x-deprecation-message']).toBe('Use newField instead');
    });

    it('does not include deprecation message when deprecated is false', () => {
      const result = buildPropertySchema(
        { deprecated: false, deprecationMessage: 'Use newField' },
        'string',
        false,
      );
      expect(result.deprecated).toBeUndefined();
      expect(result['x-deprecation-message']).toBeUndefined();
    });

    // Examples
    it('includes examples as parsed JSON', () => {
      const result = buildPropertySchema(
        { examples: ['"hello"', '42', '{"key": "value"}'] },
        'string',
        false,
      );
      expect(result.examples).toEqual(['hello', 42, { key: 'value' }]);
    });

    it('uses raw string if example is not valid JSON', () => {
      const result = buildPropertySchema(
        { examples: ['not-json'] },
        'string',
        false,
      );
      expect(result.examples).toEqual(['not-json']);
    });

    // Enum values
    it('includes enum values', () => {
      const result = buildPropertySchema(
        { enum: ['active', 'inactive', 'pending'] },
        'string',
        false,
      );
      expect(result.enum).toEqual(['active', 'inactive', 'pending']);
    });

    // Const value
    it('includes const as parsed JSON', () => {
      const result = buildPropertySchema({ const: '"fixed"' }, 'string', false);
      expect(result.const).toBe('fixed');
    });

    it('includes const as raw string when not valid JSON', () => {
      const result = buildPropertySchema({ const: 'raw-value' }, 'string', false);
      expect(result.const).toBe('raw-value');
    });

    it('prefers const over enum when both set', () => {
      const result = buildPropertySchema(
        { const: '"fixed"', enum: ['a', 'b'] },
        'string',
        false,
      );
      expect(result.const).toBe('fixed');
      expect(result.enum).toBeUndefined();
    });

    // Default value
    it('includes default value', () => {
      const result = buildPropertySchema({ default: 'hello' }, 'string', false);
      expect(result.default).toBe('hello');
    });

    it('coerces default from JSON string for boolean/object/array (#110)', () => {
      expect(buildPropertySchema({ default: 'true' }, 'boolean', false).default).toBe(true);
      expect(buildPropertySchema({ default: 'false' }, 'boolean', false).default).toBe(false);
      expect(buildPropertySchema({ default: '{"a":1}' }, 'object', false).default).toEqual({ a: 1 });
      const arrResult = buildPropertySchema({ default: '[1,2]' }, 'string', true);
      expect(arrResult.default).toEqual([1, 2]);
      // default must not leak into items subschema
      expect(arrResult.items?.default).toBeUndefined();
    });

    it('does not coerce string defaults that look like other types (#110)', () => {
      // "42" should remain the string "42" for a string property
      expect(buildPropertySchema({ default: '42' }, 'string', false).default).toBe('42');
      // "true" should remain the string "true" for a string property
      expect(buildPropertySchema({ default: 'true' }, 'string', false).default).toBe('true');
    });

    // Array type
    it('builds an array schema with items', () => {
      const result = buildPropertySchema({}, 'string', true);
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ type: 'string' });
    });

    it('applies array constraints', () => {
      const result = buildPropertySchema(
        { minItems: '1', maxItems: '10', uniqueItems: true },
        'string',
        true,
      );
      expect(result.minItems).toBe(1);
      expect(result.maxItems).toBe(10);
      expect(result.uniqueItems).toBe(true);
    });

    it('applies string constraints inside items for array of strings', () => {
      const result = buildPropertySchema(
        { format: 'email', minLength: '5', pattern: '^[a-z]' },
        'string',
        true,
      );
      expect(result.items.format).toBe('email');
      expect(result.items.minLength).toBe(5);
      expect(result.items.pattern).toBe('^[a-z]');
    });

    it('applies number constraints inside items for array of numbers', () => {
      const result = buildPropertySchema(
        { minimum: '0', maximum: '100', minimumType: 'inclusive', maximumType: 'exclusive' },
        'number',
        true,
      );
      expect(result.items.minimum).toBe(0);
      expect(result.items.exclusiveMaximum).toBe(100);
    });

    // Contains (JSON Schema 2020-12)
    it('includes contains schema for arrays', () => {
      const result = buildPropertySchema(
        { contains: '{ "type": "number" }' },
        'string',
        true,
      );
      expect(result.contains).toEqual({ type: 'number' });
    });

    it('includes minContains and maxContains with contains', () => {
      const result = buildPropertySchema(
        { contains: '{ "type": "string" }', minContains: '2', maxContains: '5' },
        'string',
        true,
      );
      expect(result.minContains).toBe(2);
      expect(result.maxContains).toBe(5);
    });

    it('does not include minContains/maxContains without contains', () => {
      const result = buildPropertySchema(
        { minContains: '2', maxContains: '5' },
        'string',
        true,
      );
      expect(result.minContains).toBeUndefined();
      expect(result.maxContains).toBeUndefined();
    });

    // Tuple mode (prefixItems)
    it('builds tuple mode with prefixItems', () => {
      const prefixItems = [{ type: 'string' }, { type: 'number' }];
      const result = buildPropertySchema(
        { tupleMode: true, prefixItems, itemsSchema: '{ "type": "boolean" }' },
        'string',
        true,
      );
      expect(result.prefixItems).toEqual(prefixItems);
      expect(result.items).toEqual({ type: 'boolean' });
    });

    it('defaults items to true in tuple mode when no itemsSchema', () => {
      const result = buildPropertySchema(
        { tupleMode: true, prefixItems: [{ type: 'string' }] },
        'string',
        true,
      );
      expect(result.items).toBe(true);
    });

    it('uses itemsSchemaOverride for non-tuple array when set', () => {
      const result = buildPropertySchema(
        { itemsSchemaOverride: '{ "type": "integer", "minimum": 0 }' },
        'string',
        true,
      );
      expect(result.type).toBe('array');
      expect(result.items).toEqual({ type: 'integer', minimum: 0 });
    });

    it('ignores array value for itemsSchemaOverride and builds from base type', () => {
      const result = buildPropertySchema(
        { itemsSchemaOverride: '[{"type":"string"}]' },
        'number',
        true,
      );
      expect(result.items).toEqual({ type: 'number' });
    });

    it('ignores invalid itemsSchemaOverride and builds from base type', () => {
      const result = buildPropertySchema(
        { itemsSchemaOverride: 'not json' },
        'number',
        true,
      );
      expect(result.items).toEqual({ type: 'number' });
    });

    // Unevaluated items
    it('sets unevaluatedItems to true when allow', () => {
      const result = buildPropertySchema({ unevaluatedItems: 'allow' }, 'string', true);
      expect(result.unevaluatedItems).toBe(true);
    });

    it('sets unevaluatedItems to false when disallow', () => {
      const result = buildPropertySchema({ unevaluatedItems: 'disallow' }, 'string', true);
      expect(result.unevaluatedItems).toBe(false);
    });

    it('sets unevaluatedItems to schema when schema', () => {
      const result = buildPropertySchema(
        { unevaluatedItems: 'schema', unevaluatedItemsSchema: '{ "type": "string" }' },
        'string',
        true,
      );
      expect(result.unevaluatedItems).toEqual({ type: 'string' });
    });

    // Object constraints
    it('sets additionalProperties to true', () => {
      const result = buildPropertySchema({ additionalProperties: 'true' }, 'object', false);
      expect(result.additionalProperties).toBe(true);
    });

    it('sets additionalProperties to false', () => {
      const result = buildPropertySchema({ additionalProperties: 'false' }, 'object', false);
      expect(result.additionalProperties).toBe(false);
    });

    it('sets typed additionalProperties', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'type', additionalPropertiesType: 'number' },
        'object',
        false,
      );
      expect(result.additionalProperties).toEqual({ type: 'number' });
    });

    it('sets $ref additionalProperties from class name', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'schema', additionalPropertiesSchema: 'Address' },
        'object',
        false,
      );
      expect(result.additionalProperties).toEqual({ $ref: '#/components/schemas/Address' });
    });

    it('sets $ref additionalProperties from explicit $ref path', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'schema', additionalPropertiesSchema: '#/components/schemas/Foo' },
        'object',
        false,
      );
      expect(result.additionalProperties).toEqual({ $ref: '#/components/schemas/Foo' });
    });

    it('sets additionalProperties from JSON string', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'schema', additionalPropertiesSchema: '{ "type": "integer" }' },
        'object',
        false,
      );
      expect(result.additionalProperties).toEqual({ type: 'integer' });
    });

    it('omits additionalProperties when JSON is invalid and value is not an identifier', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'schema', additionalPropertiesSchema: '{ bad json }' },
        'object',
        false,
      );
      expect(result.additionalProperties).toBeUndefined();
    });

    it('ignores non-numeric minLength and maxLength values', () => {
      const result = buildPropertySchema(
        { minLength: 'abc', maxLength: 'xyz' },
        'string',
        false,
      );
      expect(result.minLength).toBeUndefined();
      expect(result.maxLength).toBeUndefined();
    });

    it('does not apply string constraints for non-string types', () => {
      const result = buildPropertySchema(
        { format: 'email', pattern: '^[a-z]', minLength: '3' },
        'boolean',
        false,
      );
      expect(result.format).toBeUndefined();
      expect(result.pattern).toBeUndefined();
      expect(result.minLength).toBeUndefined();
    });

    it('does not apply numeric constraints for non-numeric types', () => {
      const result = buildPropertySchema(
        { minimum: '0', maximum: '100', minimumType: 'inclusive', maximumType: 'inclusive' },
        'string',
        false,
      );
      expect(result.minimum).toBeUndefined();
      expect(result.maximum).toBeUndefined();
    });

    it('applies minProperties and maxProperties for objects', () => {
      const result = buildPropertySchema(
        { minProperties: '1', maxProperties: '10' },
        'object',
        false,
      );
      expect(result.minProperties).toBe(1);
      expect(result.maxProperties).toBe(10);
    });

    it('applies properties (object constraints)', () => {
      const props = { name: { type: 'string' }, age: { type: 'integer' } };
      const result = buildPropertySchema({ properties: props }, 'object', false);
      expect(result.properties).toEqual(props);
    });

    it('applies required (object-level property names)', () => {
      const result = buildPropertySchema(
        { objectRequired: ['name', 'email'] },
        'object',
        false,
      );
      expect(result.required).toEqual(['name', 'email']);
    });

    it('omits properties when empty object', () => {
      const result = buildPropertySchema({ properties: {} }, 'object', false);
      expect(result.properties).toBeUndefined();
    });

    it('omits required when empty array', () => {
      const result = buildPropertySchema({ objectRequired: [] }, 'object', false);
      expect(result.required).toBeUndefined();
    });

    it('applies patternProperties', () => {
      const pp = { '^x-': { type: 'string' } };
      const result = buildPropertySchema({ patternProperties: pp }, 'object', false);
      expect(result.patternProperties).toEqual(pp);
    });

    it('applies dependentSchemas', () => {
      const ds = { name: { required: ['age'] } };
      const result = buildPropertySchema({ dependentSchemas: ds }, 'object', false);
      expect(result.dependentSchemas).toEqual(ds);
    });

    it('applies propertyNames constraints', () => {
      const result = buildPropertySchema(
        {
          propertyNamesPattern: '^[a-z]',
          propertyNamesMinLength: '2',
          propertyNamesMaxLength: '20',
          propertyNamesFormat: 'email',
          propertyNamesDescription: 'Must be lowercase',
        },
        'object',
        false,
      );
      expect(result.propertyNames).toEqual({
        type: 'string',
        pattern: '^[a-z]',
        minLength: 2,
        maxLength: 20,
        format: 'email',
        description: 'Must be lowercase',
      });
    });

    it('does not include propertyNames when no constraints set', () => {
      const result = buildPropertySchema({}, 'object', false);
      expect(result.propertyNames).toBeUndefined();
    });

    // Unevaluated properties
    it('sets unevaluatedProperties to true when allow', () => {
      const result = buildPropertySchema({ unevaluatedProperties: 'allow' }, 'object', false);
      expect(result.unevaluatedProperties).toBe(true);
    });

    it('sets unevaluatedProperties to false when disallow', () => {
      const result = buildPropertySchema({ unevaluatedProperties: 'disallow' }, 'object', false);
      expect(result.unevaluatedProperties).toBe(false);
    });

    it('sets unevaluatedProperties to schema', () => {
      const result = buildPropertySchema(
        { unevaluatedProperties: 'schema', unevaluatedPropertiesSchema: '{ "type": "string" }' },
        'object',
        false,
      );
      expect(result.unevaluatedProperties).toEqual({ type: 'string' });
    });

    // NOT composition
    it('includes not schema as parsed JSON', () => {
      const result = buildPropertySchema({ not: '{ "type": "null" }' }, 'string', false);
      expect(result.not).toEqual({ type: 'null' });
    });

    it('includes not schema as parsed value when valid JSON', () => {
      const result = buildPropertySchema({ not: 'null' }, 'string', false);
      expect(result.not).toBeNull();
    });

    it('includes not schema as raw string when not valid JSON', () => {
      const result = buildPropertySchema({ not: 'not-json' }, 'string', false);
      expect(result.not).toBe('not-json');
    });

    // Conditional (if/then/else) — JSON Schema 2020-12
    it('applies if/then/else conditional schemas', () => {
      const ifSchema = '{ "required": ["country"] }';
      const thenSchema = '{ "properties": { "country": { "const": "US" } } }';
      const elseSchema = '{ "properties": { "country": {} } }';
      const result = buildPropertySchema(
        { ifSchema, thenSchema, elseSchema },
        'object',
        false,
      );
      expect(result.if).toEqual({ required: ['country'] });
      expect(result.then).toEqual({ properties: { country: { const: 'US' } } });
      expect(result.else).toEqual({ properties: { country: {} } });
    });

    it('applies only if when then/else empty', () => {
      const result = buildPropertySchema(
        { ifSchema: '{ "type": "object" }' },
        'string',
        false,
      );
      expect(result.if).toEqual({ type: 'object' });
      expect(result.then).toBeUndefined();
      expect(result.else).toBeUndefined();
    });

    // XML Object (OpenAPI 3.1)
    it('includes XML object when any XML field is set', () => {
      const result = buildPropertySchema(
        { xmlName: 'item', xmlNamespace: 'http://example.com', xmlPrefix: 'ns', xmlAttribute: true, xmlWrapped: true },
        'string',
        false,
      );
      expect(result.xml).toEqual({
        name: 'item',
        namespace: 'http://example.com',
        prefix: 'ns',
        attribute: true,
        wrapped: true,
      });
    });

    it('does not include XML object when no XML fields set', () => {
      const result = buildPropertySchema({}, 'string', false);
      expect(result.xml).toBeUndefined();
    });

    // Content media type
    it('includes contentMediaType and contentEncoding', () => {
      const result = buildPropertySchema(
        { contentMediaType: 'image/png', contentEncoding: 'base64' },
        'string',
        false,
      );
      expect(result.contentMediaType).toBe('image/png');
      expect(result.contentEncoding).toBe('base64');
    });

    it('includes contentSchema as parsed JSON', () => {
      const result = buildPropertySchema(
        { contentSchema: '{ "type": "object" }' },
        'string',
        false,
      );
      expect(result.contentSchema).toEqual({ type: 'object' });
    });

    // $comment
    it('includes $comment', () => {
      const result = buildPropertySchema({ $comment: 'Internal note' }, 'string', false);
      expect(result.$comment).toBe('Internal note');
    });

    // Extensions
    it('includes x- extensions', () => {
      const result = buildPropertySchema(
        { extensions: { 'x-custom': 'value', 'x-order': 5 } },
        'string',
        false,
      );
      expect(result['x-custom']).toBe('value');
      expect(result['x-order']).toBe(5);
    });

    // External docs
    it('includes externalDocs with URL and description', () => {
      const result = buildPropertySchema(
        { externalDocsUrl: 'https://docs.example.com', externalDocsDescription: 'See docs' },
        'string',
        false,
      );
      expect(result.externalDocs).toEqual({
        url: 'https://docs.example.com',
        description: 'See docs',
      });
    });

    it('does not include externalDocs when URL is empty', () => {
      const result = buildPropertySchema(
        { externalDocsDescription: 'See docs' },
        'string',
        false,
      );
      expect(result.externalDocs).toBeUndefined();
    });

    // Object constraints in array items
    it('applies object constraints inside array items', () => {
      const result = buildPropertySchema(
        { additionalProperties: 'false', minProperties: '1', maxProperties: '5' },
        'object',
        true,
      );
      expect(result.items.additionalProperties).toBe(false);
      expect(result.items.minProperties).toBe(1);
      expect(result.items.maxProperties).toBe(5);
    });

    // Complex combined schema
    it('builds a complex string with all constraints', () => {
      const formData: PropertyFormData = {
        title: 'Email',
        description: 'User email address',
        format: 'email',
        pattern: '^[a-z]',
        minLength: '5',
        maxLength: '100',
        required: true,
        readOnly: false,
        writeOnly: false,
        deprecated: true,
        deprecationMessage: 'Use contact_email',
        examples: ['"user@example.com"'],
        default: 'admin@example.com',
        $comment: 'Primary contact',
        externalDocsUrl: 'https://docs.example.com/email',
      };
      const result = buildPropertySchema(formData, 'string', false);
      expect(result.title).toBe('Email');
      expect(result.description).toBe('User email address');
      expect(result.type).toBe('string');
      expect(result.format).toBe('email');
      expect(result.pattern).toBe('^[a-z]');
      expect(result.minLength).toBe(5);
      expect(result.maxLength).toBe(100);
      expect(result['x-required']).toBe(true);
      expect(result.required).toBeUndefined();
      expect(result.deprecated).toBe(true);
      expect(result['x-deprecation-message']).toBe('Use contact_email');
      expect(result.examples).toEqual(['user@example.com']);
      expect(result.default).toBe('admin@example.com');
      expect(result.$comment).toBe('Primary contact');
      expect(result.externalDocs.url).toBe('https://docs.example.com/email');
    });
  });

  describe('parsePropertySchema', () => {
    it('parses a minimal string schema', () => {
      const { formData, propertyType, isArray } = parsePropertySchema({ type: 'string' });
      expect(propertyType).toBe('string');
      expect(isArray).toBe(false);
      expect(formData.nullable).toBe(false);
    });

    it('parses a minimal number schema', () => {
      const { propertyType } = parsePropertySchema({ type: 'number' });
      expect(propertyType).toBe('number');
    });

    it('parses a minimal integer schema', () => {
      const { propertyType } = parsePropertySchema({ type: 'integer' });
      expect(propertyType).toBe('integer');
    });

    it('parses a minimal boolean schema', () => {
      const { propertyType } = parsePropertySchema({ type: 'boolean' });
      expect(propertyType).toBe('boolean');
    });

    it('parses a direct $ref schema', () => {
      const { formData, propertyType, isArray } = parsePropertySchema({
        $ref: '#/components/schemas/Address',
      });
      expect(formData.$ref).toBe('#/components/schemas/Address');
      expect(propertyType).toBe('object');
      expect(isArray).toBe(false);
    });

    it('parses a nullable $ref anyOf schema', () => {
      const { formData } = parsePropertySchema({
        anyOf: [{ $ref: '#/components/schemas/Address' }, { type: 'null' }],
      });
      expect(formData.$ref).toBe('#/components/schemas/Address');
      expect(formData.nullable).toBe(true);
    });

    it('parses an array with $ref items', () => {
      const { formData, propertyType, isArray } = parsePropertySchema({
        type: 'array',
        items: { $ref: '#/components/schemas/Address' },
      });
      expect(formData.$ref).toBe('#/components/schemas/Address');
      expect(propertyType).toBe('object');
      expect(isArray).toBe(true);
    });

    it('parses a nullable string type', () => {
      const { formData, propertyType } = parsePropertySchema({ type: ['string', 'null'] });
      expect(propertyType).toBe('string');
      expect(formData.nullable).toBe(true);
    });

    it('parses a nullable array type', () => {
      const { formData, isArray } = parsePropertySchema({
        type: ['array', 'null'],
        items: { type: 'string' },
      });
      expect(isArray).toBe(true);
      expect(formData.nullable).toBe(true);
    });

    it('parses string constraints', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        format: 'email',
        pattern: '^[a-z]',
        minLength: 5,
        maxLength: 100,
      });
      expect(formData.format).toBe('email');
      expect(formData.pattern).toBe('^[a-z]');
      expect(formData.minLength).toBe('5');
      expect(formData.maxLength).toBe('100');
    });

    it('parses inclusive minimum and maximum', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        minimum: 0,
        maximum: 100,
      });
      expect(formData.minimum).toBe('0');
      expect(formData.minimumType).toBe('inclusive');
      expect(formData.maximum).toBe('100');
      expect(formData.maximumType).toBe('inclusive');
    });

    it('parses exclusive minimum and maximum', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        exclusiveMinimum: 0,
        exclusiveMaximum: 100,
      });
      expect(formData.minimum).toBe('0');
      expect(formData.minimumType).toBe('exclusive');
      expect(formData.maximum).toBe('100');
      expect(formData.maximumType).toBe('exclusive');
    });

    it('parses multipleOf', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        multipleOf: 0.01,
      });
      expect(formData.multipleOf).toBe('0.01');
    });

    it('parses enum values', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        enum: ['a', 'b', 'c'],
      });
      expect(formData.enum).toEqual(['a', 'b', 'c']);
    });

    it('parses const value (string)', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        const: 'fixed',
      });
      expect(formData.const).toBe('fixed');
    });

    it('parses const value (number)', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        const: 42,
      });
      expect(formData.const).toBe('42');
    });

    it('parses default value', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        default: 'hello',
      });
      expect(formData.default).toBe('hello');
    });

    it('parses enum values (number type) as string[]', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        enum: [1, 2, 3],
      });
      expect(formData.enum).toEqual(['1', '2', '3']);
    });

    it('serializes non-primitive enum values with JSON.stringify in parsePropertySchema', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        enum: [{ key: 'a' }, [1, 2], 'plain'],
      });
      expect(formData.enum).toEqual(['{"key":"a"}', '[1,2]', 'plain']);
    });

    it('parses default value (number type)', () => {
      const { formData } = parsePropertySchema({
        type: 'number',
        default: 42.5,
      });
      expect(formData.default).toBe('42.5');
    });

    it('parses default value (object/array) as JSON string for round-trip (#110)', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        default: { key: 'value' },
      });
      expect(formData.default).toBe('{"key":"value"}');
      const { formData: formData2 } = parsePropertySchema({
        type: 'array',
        default: [1, 2],
      });
      expect(formData2.default).toBe('[1,2]');
    });

    it('falls back to items.default for arrays created before top-level default was used (#110)', () => {
      // Schemas created before the fix stored default on items.default; we must remain backward-compatible.
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string', default: ['a', 'b'] as any },
      });
      expect(formData.default).toBe('["a","b"]');
    });

    it('parses number format', () => {
      const { formData } = parsePropertySchema({
        type: 'integer',
        format: 'int64',
      });
      expect(formData.format).toBe('int64');
    });

    it('parses metadata flags', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        'x-required': true,
        readOnly: true,
        writeOnly: true,
        deprecated: true,
        'x-deprecation-message': 'Use newField',
      });
      expect(formData.required).toBe(true);
      expect(formData.readOnly).toBe(true);
      expect(formData.writeOnly).toBe(true);
      expect(formData.deprecated).toBe(true);
      expect(formData.deprecationMessage).toBe('Use newField');
    });

    it('parses examples', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        examples: ['hello', 42, { key: 'value' }],
      });
      expect(formData.examples).toEqual(['hello', '42', '{"key":"value"}']);
    });

    it('parses title and description', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        title: 'My Title',
        description: 'My Description',
      });
      expect(formData.title).toBe('My Title');
      expect(formData.description).toBe('My Description');
    });

    // Array parsing
    it('parses an array type', () => {
      const { formData, propertyType, isArray } = parsePropertySchema({
        type: 'array',
        items: { type: 'number' },
      });
      expect(isArray).toBe(true);
      expect(propertyType).toBe('number');
      expect(formData.nullable).toBe(false);
    });

    it('parses array constraints', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
      });
      expect(formData.minItems).toBe('1');
      expect(formData.maxItems).toBe('10');
      expect(formData.uniqueItems).toBe(true);
    });

    it('parses string constraints from array items', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string', format: 'email', minLength: 5 },
      });
      expect(formData.format).toBe('email');
      expect(formData.minLength).toBe('5');
    });

    it('parses contains schema', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string' },
        contains: { type: 'number' },
        minContains: 2,
        maxContains: 5,
      });
      expect(formData.contains).toBe(JSON.stringify({ type: 'number' }, null, 2));
      expect(formData.minContains).toBe('2');
      expect(formData.maxContains).toBe('5');
    });

    it('parses tuple mode (prefixItems)', () => {
      const prefixItems = [{ type: 'string' }, { type: 'number' }];
      const { formData } = parsePropertySchema({
        type: 'array',
        prefixItems,
        items: { type: 'boolean' },
      });
      expect(formData.tupleMode).toBe(true);
      expect(formData.prefixItems).toEqual(prefixItems);
      expect(formData.itemsSchema).toBe(JSON.stringify({ type: 'boolean' }, null, 2));
    });

    it('does not set itemsSchemaOverride when array items uses only representable keywords', () => {
      const itemsSchema = { type: 'integer', minimum: 0, maximum: 100 };
      const { formData } = parsePropertySchema({
        type: 'array',
        items: itemsSchema,
      });
      expect(formData.itemsSchemaOverride).toBe('');
    });

    it('sets itemsSchemaOverride when array items contains non-representable keywords', () => {
      const itemsSchema = { anyOf: [{ type: 'string' }, { type: 'integer' }] };
      const { formData } = parsePropertySchema({
        type: 'array',
        items: itemsSchema,
      });
      expect(formData.itemsSchemaOverride).toBe(JSON.stringify(itemsSchema, null, 2));
    });

    it('does not set itemsSchemaOverride when array items has $ref', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { $ref: '#/components/schemas/Foo' },
      });
      expect(formData.$ref).toBe('#/components/schemas/Foo');
      expect(formData.itemsSchemaOverride).toBe('');
    });

    it('parses unevaluatedItems: true', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string' },
        unevaluatedItems: true,
      });
      expect(formData.unevaluatedItems).toBe('allow');
    });

    it('parses unevaluatedItems: false', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string' },
        unevaluatedItems: false,
      });
      expect(formData.unevaluatedItems).toBe('disallow');
    });

    it('parses unevaluatedItems as schema', () => {
      const { formData } = parsePropertySchema({
        type: 'array',
        items: { type: 'string' },
        unevaluatedItems: { type: 'number' },
      });
      expect(formData.unevaluatedItems).toBe('schema');
      expect(formData.unevaluatedItemsSchema).toBe(JSON.stringify({ type: 'number' }, null, 2));
    });

    // Object constraints
    it('parses properties (object constraints)', () => {
      const props = { name: { type: 'string' }, age: { type: 'integer' } };
      const { formData } = parsePropertySchema({
        type: 'object',
        properties: props,
      });
      expect(formData.properties).toEqual(props);
    });

    it('rejects array as properties value', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        properties: ['name', 'age'] as any,
      });
      expect(formData.properties).toBeUndefined();
    });

    it('parses required (object-level property names)', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        required: ['name', 'email'],
      });
      expect(formData.objectRequired).toEqual(['name', 'email']);
    });

    it('trims and deduplicates required entries', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        required: ['name', '  name  ', 'email', 'email'],
      });
      expect(formData.objectRequired).toEqual(['name', 'email']);
    });

    it('filters empty strings from required', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        required: ['name', '   ', '', 'email'],
      });
      expect(formData.objectRequired).toEqual(['name', 'email']);
    });

    it('returns undefined for objectRequired when all required entries are empty/whitespace', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        required: ['   ', ''],
      });
      expect(formData.objectRequired).toBeUndefined();
    });

    it('parses object with properties and required', () => {
      const props = { id: { type: 'integer' }, label: { type: 'string' } };
      const { formData } = parsePropertySchema({
        type: 'object',
        properties: props,
        required: ['id'],
      });
      expect(formData.properties).toEqual(props);
      expect(formData.objectRequired).toEqual(['id']);
    });

    it('parses additionalProperties: true', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        additionalProperties: true,
      });
      expect(formData.additionalProperties).toBe('true');
    });

    it('parses additionalProperties: false', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        additionalProperties: false,
      });
      expect(formData.additionalProperties).toBe('false');
    });

    it('parses typed additionalProperties', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        additionalProperties: { type: 'number' },
      });
      expect(formData.additionalProperties).toBe('type');
      expect(formData.additionalPropertiesType).toBe('number');
    });

    it('parses $ref additionalProperties', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/Address' },
      });
      expect(formData.additionalProperties).toBe('schema');
      expect(formData.additionalPropertiesSchema).toBe('Address');
    });

    it('parses minProperties and maxProperties', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        minProperties: 1,
        maxProperties: 10,
      });
      expect(formData.minProperties).toBe('1');
      expect(formData.maxProperties).toBe('10');
    });

    it('parses patternProperties', () => {
      const pp = { '^x-': { type: 'string' } };
      const { formData } = parsePropertySchema({
        type: 'object',
        patternProperties: pp,
      });
      expect(formData.patternProperties).toEqual(pp);
    });

    it('parses dependentSchemas', () => {
      const ds = { name: { required: ['age'] } };
      const { formData } = parsePropertySchema({
        type: 'object',
        dependentSchemas: ds,
      });
      expect(formData.dependentSchemas).toEqual(ds);
    });

    it('parses propertyNames constraints', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        propertyNames: {
          type: 'string',
          pattern: '^[a-z]',
          minLength: 2,
          maxLength: 20,
          format: 'email',
          description: 'Must be lowercase',
        },
      });
      expect(formData.propertyNamesPattern).toBe('^[a-z]');
      expect(formData.propertyNamesMinLength).toBe('2');
      expect(formData.propertyNamesMaxLength).toBe('20');
      expect(formData.propertyNamesFormat).toBe('email');
      expect(formData.propertyNamesDescription).toBe('Must be lowercase');
    });

    it('parses unevaluatedProperties: true', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        unevaluatedProperties: true,
      });
      expect(formData.unevaluatedProperties).toBe('allow');
    });

    it('parses unevaluatedProperties: false', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        unevaluatedProperties: false,
      });
      expect(formData.unevaluatedProperties).toBe('disallow');
    });

    it('parses unevaluatedProperties as schema', () => {
      const { formData } = parsePropertySchema({
        type: 'object',
        unevaluatedProperties: { type: 'string' },
      });
      expect(formData.unevaluatedProperties).toBe('schema');
    });

    // NOT composition
    it('parses not schema', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        not: { type: 'null' },
      });
      expect(formData.not).toBe(JSON.stringify({ type: 'null' }, null, 2));
    });

    it('parses if/then/else conditional schemas', () => {
      const ifSchema = { required: ['country'] };
      const thenSchema = { properties: { country: { const: 'US' } } };
      const elseSchema = { properties: { country: {} } };
      const { formData } = parsePropertySchema({
        type: 'object',
        if: ifSchema,
        then: thenSchema,
        else: elseSchema,
      });
      expect(formData.ifSchema).toBe(JSON.stringify(ifSchema, null, 2));
      expect(formData.thenSchema).toBe(JSON.stringify(thenSchema, null, 2));
      expect(formData.elseSchema).toBe(JSON.stringify(elseSchema, null, 2));
    });

    it('parses missing if/then/else as empty string', () => {
      const { formData } = parsePropertySchema({ type: 'string' });
      expect(formData.ifSchema).toBe('');
      expect(formData.thenSchema).toBe('');
      expect(formData.elseSchema).toBe('');
    });

    // XML Object
    it('parses XML object', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        xml: { name: 'item', namespace: 'http://example.com', prefix: 'ns', attribute: true, wrapped: true },
      });
      expect(formData.xmlName).toBe('item');
      expect(formData.xmlNamespace).toBe('http://example.com');
      expect(formData.xmlPrefix).toBe('ns');
      expect(formData.xmlAttribute).toBe(true);
      expect(formData.xmlWrapped).toBe(true);
    });

    // Content media type
    it('parses content media type fields', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        contentMediaType: 'image/png',
        contentEncoding: 'base64',
        contentSchema: { type: 'object' },
      });
      expect(formData.contentMediaType).toBe('image/png');
      expect(formData.contentEncoding).toBe('base64');
      expect(formData.contentSchema).toBe(JSON.stringify({ type: 'object' }, null, 2));
    });

    // $comment
    it('parses $comment', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        $comment: 'Internal note',
      });
      expect(formData.$comment).toBe('Internal note');
    });

    // Extensions
    it('parses x- extensions', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        'x-custom': 'value',
        'x-order': 5,
      });
      expect(formData.extensions).toEqual({ 'x-custom': 'value', 'x-order': 5 });
    });

    it('excludes x-deprecation-message from extensions', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        deprecated: true,
        'x-deprecation-message': 'Old',
        'x-other': 'kept',
      });
      expect(formData.extensions).toEqual({ 'x-other': 'kept' });
      expect(formData.deprecationMessage).toBe('Old');
    });

    it('excludes x-required from extensions (#112)', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        'x-required': true,
        'x-custom': 'value',
      });
      expect(formData.required).toBe(true);
      expect(formData.extensions).toEqual({ 'x-custom': 'value' });
    });

    // External docs
    it('parses externalDocs', () => {
      const { formData } = parsePropertySchema({
        type: 'string',
        externalDocs: { url: 'https://docs.example.com', description: 'See docs' },
      });
      expect(formData.externalDocsUrl).toBe('https://docs.example.com');
      expect(formData.externalDocsDescription).toBe('See docs');
    });
  });

  describe('round-trip: buildPropertySchema → parsePropertySchema', () => {
    it('round-trips a string with format and constraints', () => {
      const original: PropertyFormData = {
        title: 'Email Address',
        description: 'Contact email',
        format: 'email',
        minLength: '5',
        maxLength: '100',
        required: true,
      };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData, propertyType, isArray } = parsePropertySchema(schema);
      expect(propertyType).toBe('string');
      expect(isArray).toBe(false);
      expect(formData.title).toBe('Email Address');
      expect(formData.description).toBe('Contact email');
      expect(formData.format).toBe('email');
      expect(formData.minLength).toBe('5');
      expect(formData.maxLength).toBe('100');
      expect(formData.required).toBe(true);
    });

    it('round-trips a nullable integer with exclusive bounds', () => {
      const original: PropertyFormData = {
        nullable: true,
        minimum: '0',
        minimumType: 'exclusive',
        maximum: '100',
        maximumType: 'exclusive',
        multipleOf: '5',
      };
      const schema = buildPropertySchema(original, 'integer', false);
      const { formData, propertyType } = parsePropertySchema(schema);
      expect(propertyType).toBe('integer');
      expect(formData.nullable).toBe(true);
      expect(formData.minimum).toBe('0');
      expect(formData.minimumType).toBe('exclusive');
      expect(formData.maximum).toBe('100');
      expect(formData.maximumType).toBe('exclusive');
      expect(formData.multipleOf).toBe('5');
    });

    it('round-trips an array of strings with constraints', () => {
      const original: PropertyFormData = {
        minItems: '1',
        maxItems: '20',
        uniqueItems: true,
        format: 'uuid',
      };
      const schema = buildPropertySchema(original, 'string', true);
      const { formData, propertyType, isArray } = parsePropertySchema(schema);
      expect(isArray).toBe(true);
      expect(propertyType).toBe('string');
      expect(formData.minItems).toBe('1');
      expect(formData.maxItems).toBe('20');
      expect(formData.uniqueItems).toBe(true);
      expect(formData.format).toBe('uuid');
    });

    it('round-trips an object with all constraints', () => {
      const original: PropertyFormData = {
        properties: { name: { type: 'string' }, count: { type: 'integer' } },
        objectRequired: ['name'],
        additionalProperties: 'false',
        minProperties: '1',
        maxProperties: '10',
        propertyNamesPattern: '^[a-z]',
        unevaluatedProperties: 'disallow',
      };
      const schema = buildPropertySchema(original, 'object', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.properties).toEqual(original.properties);
      expect(formData.objectRequired).toEqual(['name']);
      expect(formData.additionalProperties).toBe('false');
      expect(formData.minProperties).toBe('1');
      expect(formData.maxProperties).toBe('10');
      expect(formData.propertyNamesPattern).toBe('^[a-z]');
      expect(formData.unevaluatedProperties).toBe('disallow');
    });

    it('round-trips XML and external docs', () => {
      const original: PropertyFormData = {
        xmlName: 'item',
        xmlAttribute: true,
        externalDocsUrl: 'https://example.com',
        externalDocsDescription: 'Docs',
      };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.xmlName).toBe('item');
      expect(formData.xmlAttribute).toBe(true);
      expect(formData.externalDocsUrl).toBe('https://example.com');
      expect(formData.externalDocsDescription).toBe('Docs');
    });

    it('round-trips content media type fields', () => {
      const original: PropertyFormData = {
        contentMediaType: 'image/png',
        contentEncoding: 'base64',
      };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.contentMediaType).toBe('image/png');
      expect(formData.contentEncoding).toBe('base64');
    });

    it('round-trips $comment', () => {
      const schema = buildPropertySchema({ $comment: 'Note' }, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.$comment).toBe('Note');
    });

    it('round-trips extensions', () => {
      const original: PropertyFormData = {
        extensions: { 'x-custom': 'value' },
      };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.extensions).toEqual({ 'x-custom': 'value' });
    });

    it('round-trips deprecated with message', () => {
      const original: PropertyFormData = {
        deprecated: true,
        deprecationMessage: 'Use newField',
      };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.deprecated).toBe(true);
      expect(formData.deprecationMessage).toBe('Use newField');
    });

    it('round-trips enum values', () => {
      const original: PropertyFormData = { enum: ['a', 'b', 'c'] };
      const schema = buildPropertySchema(original, 'string', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.enum).toEqual(['a', 'b', 'c']);
    });

    it('round-trips contains with minContains and maxContains', () => {
      const original: PropertyFormData = {
        contains: '{ "type": "string" }',
        minContains: '2',
        maxContains: '5',
      };
      const schema = buildPropertySchema(original, 'string', true);
      const { formData } = parsePropertySchema(schema);
      expect(formData.minContains).toBe('2');
      expect(formData.maxContains).toBe('5');
    });

    it('round-trips tuple mode', () => {
      const original: PropertyFormData = {
        tupleMode: true,
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        itemsSchema: '{ "type": "boolean" }',
      };
      const schema = buildPropertySchema(original, 'string', true);
      const { formData } = parsePropertySchema(schema);
      expect(formData.tupleMode).toBe(true);
      expect(formData.prefixItems).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('round-trips itemsSchemaOverride for non-tuple array with non-representable keywords', () => {
      const itemsJson = JSON.stringify({ anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] }, null, 2);
      const original: PropertyFormData = { itemsSchemaOverride: itemsJson };
      const schema = buildPropertySchema(original, 'string', true);
      const { formData } = parsePropertySchema(schema);
      expect(formData.itemsSchemaOverride).toBe(itemsJson);
    });

    it('round-trips if/then/else conditional schemas', () => {
      const ifSchema = JSON.stringify({ required: ['country'] }, null, 2);
      const thenSchema = JSON.stringify({ properties: { country: { const: 'US' } } }, null, 2);
      const elseSchema = JSON.stringify({ properties: { country: {} } }, null, 2);
      const original: PropertyFormData = { ifSchema, thenSchema, elseSchema };
      const schema = buildPropertySchema(original, 'object', false);
      const { formData } = parsePropertySchema(schema);
      expect(formData.ifSchema).toBe(ifSchema);
      expect(formData.thenSchema).toBe(thenSchema);
      expect(formData.elseSchema).toBe(elseSchema);
    });
  });

  describe('GitHub #118: SQL mode class references', () => {
    it('buildPropertySchema emits ID-based metadata in sql mode', () => {
      const fd: PropertyFormData = { $ref: '#/components/schemas/Order' };
      const schema = buildPropertySchema(fd, 'object', false, {
        schemaMode: 'sql',
        resolveRefClassId: () => 'cls-1',
      });
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('uuid');
      expect(schema['x-ref-storage']).toBe('id');
      expect(schema['x-ref-class-name']).toBe('Order');
      expect(schema['x-ref-class-id']).toBe('cls-1');
      expect(schema.$ref).toBeUndefined();
    });

    it('buildPropertySchema keeps nested $ref in sql when refStorage is nested', () => {
      const fd: PropertyFormData = {
        $ref: '#/components/schemas/Order',
        refStorage: 'nested',
      };
      const schema = buildPropertySchema(fd, 'object', false, {
        schemaMode: 'sql',
        resolveRefClassId: () => 'z',
      });
      expect(schema.$ref).toBe('#/components/schemas/Order');
      expect(schema['x-ref-storage']).toBe('nested');
      expect(schema['x-ref-class-name']).toBe('Order');
    });

    it('parsePropertySchema restores form for ID-based scalar storage', () => {
      const schema = {
        type: 'string',
        format: 'uuid',
        'x-ref-storage': 'id',
        'x-ref-class-name': 'Customer',
      };
      const { formData, propertyType } = parsePropertySchema(schema);
      expect(propertyType).toBe('object');
      expect(formData.$ref).toBe('#/components/schemas/Customer');
      expect(formData.refStorage).toBe('id');
    });

    it('buildPropertySchema array of ID refs in sql mode', () => {
      const fd: PropertyFormData = { $ref: 'Item' };
      const schema = buildPropertySchema(fd, 'object', true, { schemaMode: 'sql' });
      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({ type: 'string', format: 'uuid' });
      expect(schema['x-ref-storage']).toBe('id');
      expect(schema['x-ref-class-name']).toBe('Item');
    });

    it('parsePropertySchema restores array ID ref form', () => {
      const schema = {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        'x-ref-storage': 'id',
        'x-ref-class-name': 'Tag',
      };
      const { formData, propertyType, isArray } = parsePropertySchema(schema);
      expect(isArray).toBe(true);
      expect(propertyType).toBe('object');
      expect(formData.refStorage).toBe('id');
      expect(formData.$ref).toBe('#/components/schemas/Tag');
    });
  });
});
