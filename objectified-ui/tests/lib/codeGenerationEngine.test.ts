/**
 * Reference: GitHub #119 — configurable code generation templates.
 */

import { describe, expect, it } from '@jest/globals';
import type { StudioClass } from '@lib/studio/types';
import {
  generateTypeScript,
  generateGraphQL,
  buildCodegenMustacheView,
  toSnakeCase,
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
});
