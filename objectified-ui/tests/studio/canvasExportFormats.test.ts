/**
 * Unit tests for canvas export formats (GitHub #92).
 */

import {
  exportAsMermaid,
  exportAsPlantUML,
  exportAsDot,
  exportAsGraphML,
  exportAsJson,
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
  });
});
