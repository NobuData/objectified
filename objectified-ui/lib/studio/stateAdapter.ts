/**
 * Adapters to convert API responses to LocalVersionState and state to commit payload.
 */

import type {
  VersionPullResponse,
  VersionCommitPayload,
  VersionCommitClass,
  VersionCommitClassProperty,
  ClassWithPropertiesAndTags,
  PropertySchema,
} from '@lib/api/rest-client';
import type {
  LocalVersionState,
  StudioClass,
  StudioClassProperty,
  StudioProperty,
  ClassCanvasMetadata,
} from './types';
import { generateLocalId } from './types';

export interface PullResponseToStateOptions {
  readOnly?: boolean;
}

/** Build LocalVersionState from pull response and optional project properties. */
export function pullResponseToState(
  pull: VersionPullResponse,
  projectProperties: PropertySchema[] = [],
  opts?: PullResponseToStateOptions
): LocalVersionState {
  const classesRaw = pull.classes ?? [];
  const classes: StudioClass[] = classesRaw.map((c) => {
    const cls = c as Record<string, unknown>;
    const props = (cls.properties as Record<string, unknown>[] | undefined) ?? [];
    const metadata = (cls.metadata as Record<string, unknown> | undefined) ?? {};
    const canvasMeta = metadata.canvas_metadata as ClassCanvasMetadata | undefined;
    const id = typeof cls.id === 'string' ? cls.id : undefined;
    return {
      id,
      localId: id ? undefined : generateLocalId(),
      version_id: typeof cls.version_id === 'string' ? cls.version_id : undefined,
      name: String(cls.name ?? ''),
      description:
        cls.description != null ? String(cls.description) : undefined,
      schema:
        cls.schema != null && typeof cls.schema === 'object' && !Array.isArray(cls.schema)
          ? (cls.schema as Record<string, unknown>)
          : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      properties: props.map((p) => ({
        id: typeof p.id === 'string' ? p.id : undefined,
        class_id: typeof p.class_id === 'string' ? p.class_id : undefined,
        property_id: typeof p.property_id === 'string' ? p.property_id : undefined,
        parent_id:
          p.parent_id != null ? String(p.parent_id) : null,
        name: String(p.name ?? ''),
        description:
          p.description != null ? String(p.description) : undefined,
        data:
          p.data != null && typeof p.data === 'object' && !Array.isArray(p.data)
            ? (p.data as Record<string, unknown>)
            : undefined,
        property_name:
          p.property_name != null ? String(p.property_name) : undefined,
        property_data:
          p.property_data != null &&
          typeof p.property_data === 'object' &&
          !Array.isArray(p.property_data)
            ? (p.property_data as Record<string, unknown>)
            : undefined,
      })) as StudioClassProperty[],
      canvas_metadata: canvasMeta,
      tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : undefined,
    };
  });

  const properties: StudioProperty[] = projectProperties.map((p) => ({
    id: p.id,
    project_id: p.project_id,
    name: p.name,
    description: p.description,
    data: p.data,
  }));

  return {
    versionId: pull.version_id,
    revision: pull.revision ?? null,
    classes,
    properties,
    canvas_metadata: pull.canvas_metadata ?? null,
    groups: [],
    readOnly: opts?.readOnly ?? false,
  };
}

/** Build LocalVersionState from listClassesWithPropertiesAndTags + optional listProperties. */
export function classesAndPropertiesToState(
  versionId: string,
  revision: number | null,
  classesRaw: ClassWithPropertiesAndTags[],
  projectProperties: PropertySchema[] = [],
  versionCanvasMetadata: Record<string, unknown> | null = null
): LocalVersionState {
  const classes: StudioClass[] = classesRaw.map((c) => {
    const metadata = c.metadata ?? {};
    const canvasMeta = metadata?.canvas_metadata as ClassCanvasMetadata | undefined;
    const id = c.id;
    return {
      id,
      localId: id ? undefined : generateLocalId(),
      version_id: c.version_id,
      name: c.name,
      description: c.description ?? undefined,
      schema: c.schema,
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
      properties: (c.properties ?? []).map((p) => ({
        id: p.id,
        class_id: p.class_id,
        property_id: p.property_id,
        parent_id: p.parent_id ?? null,
        name: p.name,
        description: p.description ?? undefined,
        data: p.data,
        property_name: (p as unknown as Record<string, unknown>).property_name as string | undefined,
        property_data: (p as unknown as Record<string, unknown>).property_data as
          | Record<string, unknown>
          | undefined,
      })),
      canvas_metadata: canvasMeta,
      tags: c.tags,
    };
  });

  const properties: StudioProperty[] = projectProperties.map((p) => ({
    id: p.id,
    project_id: p.project_id,
    name: p.name,
    description: p.description,
    data: p.data,
  }));

  return {
    versionId,
    revision,
    classes,
    properties,
    canvas_metadata: versionCanvasMetadata,
    groups: [],
  };
}

export interface CommitPayloadOptions {
  label?: string | null;
  description?: string | null;
  message?: string | null;
}

/** Build VersionCommitPayload from LocalVersionState for commit/push. */
export function stateToCommitPayload(
  state: LocalVersionState,
  opts?: CommitPayloadOptions
): VersionCommitPayload {
  const options = opts ?? {};
  const classesPayload: VersionCommitClass[] = state.classes.map((c) => {
    const propertiesPayload: VersionCommitClassProperty[] = c.properties.map((p) => ({
      name: p.name,
      description: p.description ?? null,
      data: p.data ?? undefined,
      property_name: p.property_name ?? null,
      property_data: p.property_data ?? null,
    }));
    const metadata: Record<string, unknown> = {
      ...(c.metadata ?? {}),
      ...(c.canvas_metadata
        ? { canvas_metadata: c.canvas_metadata }
        : {}),
      ...(c.tags != null && c.tags.length > 0 ? { tags: c.tags } : {}),
    };
    return {
      name: c.name,
      description: c.description ?? null,
      schema: c.schema ?? null,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      properties: propertiesPayload,
    };
  });

  return {
    classes: classesPayload,
    canvas_metadata: state.canvas_metadata,
    label: options.label ?? 'save',
    description: options.description ?? null,
    message: options.message ?? null,
  };
}
