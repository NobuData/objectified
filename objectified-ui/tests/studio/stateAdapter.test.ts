/**
 * Unit tests for studio state adapters: pullResponseToState, stateToCommitPayload.
 */

import {
  pullResponseToState,
  stateToCommitPayload,
  classesAndPropertiesToState,
} from '@lib/studio/stateAdapter';
import type { LocalVersionState } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';

describe('pullResponseToState', () => {
  it('converts empty pull response to state', () => {
    const pull = {
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    };
    const state = pullResponseToState(pull);
    expect(state.versionId).toBe('v1');
    expect(state.revision).toBe(1);
    expect(state.classes).toEqual([]);
    expect(state.properties).toEqual([]);
    expect(state.canvas_metadata).toBeNull();
    expect(state.groups).toEqual([]);
  });

  it('converts pull response with classes and nested properties to state', () => {
    const pull = {
      version_id: 'v1',
      revision: 2,
      classes: [
        {
          id: 'c1',
          version_id: 'v1',
          name: 'User',
          description: 'User class',
          schema: { type: 'object' },
          metadata: { tags: ['domain'] },
          properties: [
            {
              id: 'cp1',
              class_id: 'c1',
              property_id: 'p1',
              name: 'email',
              description: 'Email field',
              data: {},
            },
          ],
        },
      ],
      canvas_metadata: { layout: 'grid' },
      pulled_at: new Date().toISOString(),
    };
    const state = pullResponseToState(pull);
    expect(state.versionId).toBe('v1');
    expect(state.revision).toBe(2);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('User');
    expect(state.classes[0].properties).toHaveLength(1);
    expect(state.classes[0].properties[0].name).toBe('email');
    expect(state.canvas_metadata).toEqual({ layout: 'grid' });
  });

  it('assigns localId when class has no id (e.g. edge case from server)', () => {
    const pull = {
      version_id: 'v1',
      revision: 1,
      classes: [{ name: 'NoId', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    };
    const state = pullResponseToState(pull);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].id).toBeUndefined();
    expect(state.classes[0].localId).toBeDefined();
    expect(typeof state.classes[0].localId).toBe('string');
    expect(getStableClassId(state.classes[0])).toBe(state.classes[0].localId);
  });

  it('merges project properties when provided', () => {
    const pull = {
      version_id: 'v1',
      revision: null,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    };
    const projectProperties = [
      {
        id: 'prop1',
        project_id: 'proj1',
        name: 'title',
        description: 'Title',
        data: {},
        created_at: '',
        updated_at: null,
      },
    ];
    const state = pullResponseToState(pull, projectProperties);
    expect(state.properties).toHaveLength(1);
    expect(state.properties[0].name).toBe('title');
  });

  it('sets readOnly when opts.readOnly is true', () => {
    const pull = {
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    };
    const state = pullResponseToState(pull, [], { readOnly: true });
    expect(state.readOnly).toBe(true);
  });

  it('sets readOnly false when opts not provided or readOnly false', () => {
    const pull = {
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    };
    expect(pullResponseToState(pull).readOnly).toBe(false);
    expect(pullResponseToState(pull, [], {}).readOnly).toBe(false);
  });
});

describe('stateToCommitPayload', () => {
  it('converts empty state to commit payload', () => {
    const state: LocalVersionState = {
      versionId: 'v1',
      revision: null,
      classes: [],
      properties: [],
      canvas_metadata: null,
      groups: [],
    };
    const payload = stateToCommitPayload(state);
    expect(payload.classes).toEqual([]);
    expect(payload.canvas_metadata).toBeNull();
  });

  it('converts state with classes and properties to commit payload', () => {
    const state: LocalVersionState = {
      versionId: 'v1',
      revision: 1,
      classes: [
        {
          name: 'Order',
          description: 'Order class',
          properties: [
            { name: 'total', description: 'Total amount', data: {} },
          ],
          canvas_metadata: { position: { x: 10, y: 20 } },
        },
      ],
      properties: [],
      canvas_metadata: { layout: 'free' },
      groups: [],
    };
    const payload = stateToCommitPayload(state);
    expect(payload.classes).toHaveLength(1);
    expect(payload.classes![0].name).toBe('Order');
    expect(payload.classes![0].properties).toHaveLength(1);
    expect(payload.classes![0].properties![0].name).toBe('total');
    expect(payload.classes![0].metadata).toEqual(
      expect.objectContaining({ canvas_metadata: { position: { x: 10, y: 20 } } })
    );
    expect(payload.canvas_metadata).toEqual({ layout: 'free' });
  });

  it('includes tags in class metadata when class has tags (GitHub #100)', () => {
    const state = {
      versionId: 'v1',
      revision: 1,
      classes: [
        {
          id: 'c1',
          name: 'User',
          description: '',
          properties: [],
          canvas_metadata: { position: { x: 0, y: 0 } },
          tags: ['domain', 'core'],
        },
      ],
      properties: [],
      canvas_metadata: null,
      groups: [],
    };
    const payload = stateToCommitPayload(state);
    expect(payload.classes).toHaveLength(1);
    expect(payload.classes![0].metadata).toEqual(
      expect.objectContaining({ tags: ['domain', 'core'] })
    );
  });
});

describe('classesAndPropertiesToState', () => {
  it('builds state from listClassesWithPropertiesAndTags and listProperties', () => {
    const classesRaw = [
      {
        id: 'c1',
        version_id: 'v1',
        name: 'Product',
        description: '',
        schema: {},
        metadata: { canvas_metadata: { position: { x: 5, y: 5 } } },
        properties: [
          {
            id: 'cp1',
            class_id: 'c1',
            property_id: 'p1',
            parent_id: null,
            name: 'sku',
            description: '',
            data: {},
            created_at: '',
            updated_at: null,
          },
        ],
        tags: [],
      },
    ];
    const state = classesAndPropertiesToState(
      'v1',
      3,
      classesRaw,
      [],
      { layout: 'grid' }
    );
    expect(state.versionId).toBe('v1');
    expect(state.revision).toBe(3);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('Product');
    expect(state.classes[0].canvas_metadata?.position).toEqual({ x: 5, y: 5 });
    expect(state.canvas_metadata).toEqual({ layout: 'grid' });
  });
});
