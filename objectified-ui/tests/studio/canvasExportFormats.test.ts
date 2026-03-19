/**
 * Unit tests for canvas export formats (GitHub #92).
 */

import {
  exportAsMermaid,
  exportAsPlantUML,
  exportAsDot,
  exportAsGraphML,
  exportAsJson,
  exportAsOpenApi,
  exportAsDocsMarkdown,
  exportAsDocsHtml,
  exportAsSqlDdl,
} from '@lib/studio/canvasExportFormats';
import type { StudioClass } from '@lib/studio/types';

describe('canvasExportFormats', () => {
  const classesWithRef: StudioClass[] = [
    { id: 'c1', name: 'User', properties: [] },
    {
      id: 'c2',
      name: 'Order',
      properties: [
        {
          name: 'customer',
          data: { $ref: '#/components/schemas/User' },
        },
      ],
    },
  ];

  describe('exportAsMermaid', () => {
    it('returns classDiagram with classes and relations', () => {
      const out = exportAsMermaid(classesWithRef);
      expect(out).toContain('classDiagram');
      expect(out).toContain('class User');
      expect(out).toContain('class Order');
      expect(out).toContain('Order --> User');
      expect(out).toContain('customer');
    });

    it('returns only classDiagram when no classes', () => {
      expect(exportAsMermaid([])).toBe('classDiagram');
    });
  });

  describe('exportAsPlantUML', () => {
    it('returns @startuml block with classes and relations', () => {
      const out = exportAsPlantUML(classesWithRef);
      expect(out).toContain('@startuml');
      expect(out).toContain('@enduml');
      expect(out).toContain('class "User"');
      expect(out).toContain('class "Order"');
      expect(out).toContain('c2 --> c1');
    });

    it('returns minimal content when no classes', () => {
      const out = exportAsPlantUML([]);
      expect(out).toContain('@startuml');
      expect(out).toContain('@enduml');
    });
  });

  describe('exportAsDot', () => {
    it('returns digraph with nodes and edges', () => {
      const out = exportAsDot(classesWithRef);
      expect(out).toContain('digraph G');
      expect(out).toContain('rankdir=TB');
      expect(out).toContain('"c1"');
      expect(out).toContain('"c2"');
      expect(out).toContain('"c2" -> "c1"');
    });

    it('returns minimal digraph when no classes', () => {
      const out = exportAsDot([]);
      expect(out).toContain('digraph G');
      expect(out).toContain('}');
    });
  });

  describe('exportAsGraphML', () => {
    it('returns valid GraphML XML with nodes and edges', () => {
      const out = exportAsGraphML(classesWithRef);
      expect(out).toContain('<?xml version="1.0"');
      expect(out).toContain('<graphml');
      expect(out).toContain('<graph id="G"');
      expect(out).toContain('<node id="c1">');
      expect(out).toContain('<node id="c2">');
      expect(out).toContain('<edge id="e0" source="c2" target="c1"/>');
      expect(out).toContain('</graphml>');
    });
  });

  describe('exportAsJson', () => {
    it('returns JSON with nodes and edges', () => {
      const out = exportAsJson(classesWithRef);
      const parsed = JSON.parse(out);
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.nodes.map((n: { name: string }) => n.name).sort()).toEqual(['Order', 'User']);
      expect(parsed.edges).toHaveLength(1);
      expect(parsed.edges[0]).toEqual({
        sourceId: 'c2',
        targetId: 'c1',
        label: 'customer',
      });
    });

    it('returns empty nodes and edges when no classes', () => {
      const out = exportAsJson([]);
      const parsed = JSON.parse(out);
      expect(parsed.nodes).toEqual([]);
      expect(parsed.edges).toEqual([]);
    });

    it('includes groupId on nodes when includeGroupInfo is true (GitHub #93)', () => {
      const classesWithGroup: StudioClass[] = [
        { id: 'c1', name: 'User', properties: [], canvas_metadata: { group: 'group-1' } },
        { id: 'c2', name: 'Order', properties: [] },
      ];
      const out = exportAsJson(classesWithGroup, { includeGroupInfo: true });
      const parsed = JSON.parse(out);
      expect(parsed.nodes).toHaveLength(2);
      const userNode = parsed.nodes.find((n: { id: string }) => n.id === 'c1');
      const orderNode = parsed.nodes.find((n: { id: string }) => n.id === 'c2');
      expect(userNode.groupId).toBe('group-1');
      expect(orderNode.groupId).toBeUndefined();
    });
  });

  describe('exportAsOpenApi', () => {
    it('exports a valid OpenAPI document with component schemas', () => {
      const out = exportAsOpenApi(classesWithRef, { title: 'Test API', version: '1.2.3' });
      const parsed = JSON.parse(out);
      expect(parsed.openapi).toBe('3.1.0');
      expect(parsed.info).toEqual({ title: 'Test API', version: '1.2.3' });
      expect(parsed.components.schemas.User).toBeTruthy();
      expect(parsed.components.schemas.Order).toBeTruthy();
      expect(parsed.components.schemas.Order.properties.customer.$ref).toBe('#/components/schemas/User');
    });

    it('collects required properties into schema.required', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'Thing',
          properties: [{ name: 'name', data: { type: 'string', 'x-required': true } }],
        },
      ];
      const out = exportAsOpenApi(classes);
      const parsed = JSON.parse(out);
      expect(parsed.components.schemas.Thing.required).toEqual(['name']);
    });
  });

  describe('exportAsDocsMarkdown', () => {
    it('includes schemas and property tables', () => {
      const out = exportAsDocsMarkdown(classesWithRef, {
        title: 'Docs',
        version: '1.0.0',
        brandName: 'Acme',
      });
      expect(out).toContain('# Docs');
      expect(out).toContain('**Brand**: Acme');
      expect(out).toContain('## Schemas');
      expect(out).toContain('### Order');
      expect(out).toContain('| Property | Type | Required | Description |');
      expect(out).toContain('`customer`');
    });

    it('escapes pipe characters in description table cells', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'PipeTest',
          properties: [
            { name: 'val', data: { type: 'string', description: 'A | B option' } },
          ],
        },
      ];
      const out = exportAsDocsMarkdown(classes);
      expect(out).toContain('A \\| B option');
      expect(out).not.toMatch(/(?<!\\)\|[^|]*A \| B/);
    });

    it('emits valid JSON in example fenced blocks for string values', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'ExampleTest',
          schema: { example: 'hello world' },
          properties: [],
        },
      ];
      const out = exportAsDocsMarkdown(classes);
      expect(out).toContain('```json');
      expect(out).toContain('"hello world"');
    });

    it('emits valid JSON in example fenced blocks for object values', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'ObjExample',
          schema: { example: { id: 1, name: 'Alice' } },
          properties: [],
        },
      ];
      const out = exportAsDocsMarkdown(classes);
      expect(out).toContain('```json');
      expect(out).toContain('"id": 1');
    });

    it('normalizes newlines in table cells', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'NewlineTest',
          properties: [
            { name: 'val', data: { type: 'string', description: 'Line one\nLine two' } },
          ],
        },
      ];
      const out = exportAsDocsMarkdown(classes);
      expect(out).not.toContain('\nLine two');
      expect(out).toContain('Line one Line two');
    });
  });

  describe('exportAsDocsHtml', () => {
    it('renders a single-file HTML document with schema sections', () => {
      const out = exportAsDocsHtml(classesWithRef, {
        title: 'Docs',
        version: '1.0.0',
        brandName: 'Acme',
        primaryColor: '#123456',
      });
      expect(out).toContain('<!doctype html>');
      expect(out).toContain('<title>Docs — 1.0.0</title>');
      expect(out).toContain('--primary: #123456');
      expect(out).toContain('schema-Order');
      expect(out).toContain('customer');
    });

    it('renders logo img for https logoUrl', () => {
      const out = exportAsDocsHtml(classesWithRef, {
        title: 'Docs',
        version: '1.0.0',
        logoUrl: 'https://example.com/logo.png',
        brandName: 'Acme',
      });
      expect(out).toContain('<img class="logo" src="https://example.com/logo.png"');
    });

    it('omits logo img for non-http logoUrl schemes', () => {
      const unsafeUrls = [
        'javascript:alert(1)',
        'data:image/png;base64,abc',
        'file:///etc/passwd',
        'ftp://example.com/logo.png',
      ];
      for (const logoUrl of unsafeUrls) {
        const out = exportAsDocsHtml(classesWithRef, {
          title: 'Docs',
          version: '1.0.0',
          logoUrl,
          brandName: 'Acme',
        });
        expect(out).not.toContain('<img class="logo"');
      }
    });

    it('renders logo img for http logoUrl', () => {
      const out = exportAsDocsHtml(classesWithRef, {
        title: 'Docs',
        version: '1.0.0',
        logoUrl: 'http://example.com/logo.png',
        brandName: 'Acme',
      });
      expect(out).toContain('<img class="logo" src="http://example.com/logo.png"');
    });
  });

  describe('exportAsSqlDdl', () => {
    it('exports tables and foreign keys for id-based references', () => {
      const classes: StudioClass[] = [
        { id: 'c1', name: 'User', properties: [] },
        {
          id: 'c2',
          name: 'Order',
          properties: [
            {
              name: 'customer',
              data: { 'x-ref-class-id': 'c1', 'x-ref-storage': 'id', 'x-required': true },
            },
          ],
        },
      ];
      const out = exportAsSqlDdl(classes);
      expect(out).toContain('create table if not exists "user"');
      expect(out).toContain('create table if not exists "order"');
      expect(out).toContain('"customer_id" uuid not null');
      expect(out).toContain('foreign key ("customer_id") references "user"("id")');
    });

    it('uses x-db-table and x-db-column when set (GH-123)', () => {
      const classes: StudioClass[] = [
        {
          id: 'c1',
          name: 'User',
          schema: { 'x-db-table': 'app_users' },
          properties: [
            {
              name: 'displayName',
              property_data: { type: 'string' },
              data: { 'x-db-column': 'display_name', 'x-required': true },
            },
          ],
        },
      ];
      const out = exportAsSqlDdl(classes);
      expect(out).toContain('create table if not exists "app_users"');
      expect(out).toContain('"display_name" text not null');
    });
  });
});
