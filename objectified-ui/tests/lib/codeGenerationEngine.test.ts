/**
 * Reference: GitHub #119 — configurable code generation templates.
 */

import { describe, expect, it, jest } from '@jest/globals';
import type { StudioClass } from '@lib/studio/types';
import {
  generateTypeScript,
  generateGraphQL,
  generateGo,
  buildCodegenMustacheView,
  toSnakeCase,
  toSafeIdentifier,
} from '@lib/studio/codeGenerationEngine';
import { renderCustomMustacheTemplate, generateFromBuiltinTemplate } from '@lib/studio/codeGenerationRegistry';

const sampleClasses: StudioClass[] = [
  {
    id: 'class-user',
    name: 'User',
    properties: [
      {
        name: 'email',
        property_data: { type: 'string' },
        data: { 'x-required': true },
      },
    ],
  },
  {
    id: 'class-post',
    name: 'BlogPost',
    properties: [
      { name: 'title', property_data: { type: 'string' }, data: { 'x-required': true } },
      {
        name: 'author',
        property_data: {
          type: 'string',
          'x-ref-class-id': 'class-user',
          'x-ref-storage': 'id',
        },
      },
    ],
  },
];

describe('toSnakeCase', () => {
  it('converts camelCase', () => {
    expect(toSnakeCase('fooBar')).toBe('foo_bar');
  });
});

describe('generateTypeScript', () => {
  it('emits interfaces with id and scalar fields', () => {
    const out = generateTypeScript(sampleClasses);
    expect(out).toContain('export interface User');
    expect(out).toContain('export interface BlogPost');
    expect(out).toContain('email: string');
    expect(out).toContain('title: string');
    expect(out).toMatch(/author_id\??:\s*string/);
  });
});

describe('generateGraphQL', () => {
  it('emits types with ID fields', () => {
    const out = generateGraphQL(sampleClasses);
    expect(out).toContain('type User');
    expect(out).toContain('type BlogPost');
    expect(out).toContain('author_id: ID');
  });
});

describe('buildCodegenMustacheView', () => {
  it('exposes classes and properties for templates', () => {
    const view = buildCodegenMustacheView(sampleClasses) as {
      classes: Array<{ name: string; properties: Array<{ tsType: string; column: string }> }>;
    };
    expect(view.classes).toHaveLength(2);
    const post = view.classes.find((c) => c.name === 'BlogPost');
    expect(post?.properties.some((p) => p.column === 'author_id')).toBe(true);
  });
});

describe('renderCustomMustacheTemplate', () => {
  it('renders Mustache over schema view', () => {
    const tpl = '{{#classes}}{{name}}:{{#properties}}{{column}};{{/properties}}|{{/classes}}';
    const out = renderCustomMustacheTemplate(tpl, sampleClasses);
    expect(out).toContain('User:');
    expect(out).toContain('email;');
    expect(out).toContain('BlogPost:');
  });
});

describe('generateFromBuiltinTemplate', () => {
  it('returns pydantic for pydantic id', () => {
    const out = generateFromBuiltinTemplate('pydantic', sampleClasses);
    expect(out).toContain('class User');
    expect(out).toContain('class BlogPost');
    expect(out).toContain('from pydantic import BaseModel');
  });

  it('returns sql-ddl', () => {
    const out = generateFromBuiltinTemplate('sql-ddl', sampleClasses);
    expect(out).toContain('create table');
    expect(out.toLowerCase()).toContain('user');
  });

  it('returns validation-rules JSON (GitHub #122)', () => {
    const classes: StudioClass[] = [
      {
        id: 'c1',
        name: 'Widget',
        properties: [
          {
            id: 'p1',
            name: 'sku',
            property_data: { type: 'string', pattern: '^[A-Z0-9]+$' },
            data: { 'x-required': true, minLength: 2 },
          },
        ],
      },
    ];
    const out = generateFromBuiltinTemplate('validation-rules', classes);
    const doc = JSON.parse(out) as {
      exportKind: string;
      classes: Array<{ name: string; properties: Record<string, { required?: boolean; pattern?: string; minLength?: number }> }>;
    };
    expect(doc.exportKind).toBe('objectified.validation-rules');
    expect(doc.classes[0].properties.sku.required).toBe(true);
    expect(doc.classes[0].properties.sku.pattern).toBe('^[A-Z0-9]+$');
    expect(doc.classes[0].properties.sku.minLength).toBe(2);
  });
});

describe('toSafeIdentifier', () => {
  it('returns valid identifier as-is', () => {
    expect(toSafeIdentifier('MyClass')).toBe('MyClass');
    expect(toSafeIdentifier('_my_class')).toBe('_my_class');
  });

  it('replaces spaces and hyphens with underscores', () => {
    expect(toSafeIdentifier('My Class')).toBe('My_Class');
    expect(toSafeIdentifier('my-class')).toBe('my_class');
  });

  it('prepends underscore if starts with digit', () => {
    expect(toSafeIdentifier('3DPoint')).toBe('_3DPoint');
  });

  it('handles empty string', () => {
    expect(toSafeIdentifier('')).toBe('_');
  });
});

describe('identifier sanitization in generators', () => {
  const unsafeClasses: StudioClass[] = [
    {
      id: 'class-unsafe',
      name: 'My Class',
      properties: [{ name: 'value', property_data: { type: 'string' }, data: {} }],
    },
  ];

  it('sanitizes class name in TypeScript output', () => {
    const out = generateTypeScript(unsafeClasses);
    expect(out).toContain('export interface My_Class');
    expect(out).toContain('// original: My Class');
  });

  it('sanitizes class name in GraphQL output', () => {
    const out = generateGraphQL(unsafeClasses);
    expect(out).toContain('type My_Class');
    expect(out).toContain('# original: My Class');
  });

  it('sanitizes class name in Go output', () => {
    const out = generateGo(unsafeClasses);
    expect(out).toContain('type My_Class struct');
    expect(out).toContain('// original: My Class');
  });
});

describe('generateGraphQL scalar JSON', () => {
  const classWithObject: StudioClass[] = [
    {
      id: 'class-meta',
      name: 'Meta',
      properties: [{ name: 'data', property_data: { type: 'object' }, data: {} }],
    },
  ];

  it('emits scalar JSON when object/array fields are present', () => {
    const out = generateGraphQL(classWithObject);
    expect(out).toContain('scalar JSON');
  });

  it('does not emit scalar JSON when only scalar fields are present', () => {
    const out = generateGraphQL(sampleClasses);
    expect(out).not.toContain('scalar JSON');
  });
});

describe('generateGo encoding/json import', () => {
  const classWithRaw: StudioClass[] = [
    {
      id: 'class-raw',
      name: 'RawData',
      properties: [{ name: 'payload', property_data: { type: 'object' }, data: {} }],
    },
  ];

  it('emits encoding/json import hint when json.RawMessage is used', () => {
    const out = generateGo(classWithRaw);
    expect(out).toContain('// import "encoding/json"');
  });

  it('does not emit encoding/json import when no raw message fields', () => {
    const out = generateGo(sampleClasses);
    expect(out).not.toContain('encoding/json');
  });
});

describe('buildClassModels duplicate detection', () => {
  const dupClasses: StudioClass[] = [
    { id: 'a', name: 'Widget', properties: [] },
    { id: 'b', name: 'widget', properties: [] },
  ];

  it('warns on duplicate normalized class names', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    generateTypeScript(dupClasses);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate class name')
    );
    spy.mockRestore();
  });
});
