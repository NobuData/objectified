/**
 * Class-node display configuration (expand/collapse, theme).
 * Persisted to localStorage per version so settings survive refresh.
 *
 * Reference: GitHub #80 — Class-node properties and themes
 */

const CLASS_NODE_CONFIG_KEY_PREFIX = 'objectified:canvas:class-node-config:';

export interface ClassNodeTheme {
  backgroundColor?: string;
  border?: string;
  /** Border line style when `border` is set. */
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  /** Icon identifier for the node header (e.g. "box", "circle"). */
  icon?: string;
}

export interface ClassNodeConfig {
  /** When false, properties section is collapsed. Default true. */
  propertiesExpanded?: boolean;
  theme?: ClassNodeTheme;
}

function storageKey(versionId: string): string {
  return `${CLASS_NODE_CONFIG_KEY_PREFIX}${versionId}`;
}

interface StoredConfig {
  configs: Record<string, ClassNodeConfig>;
  savedAt: string;
}

const DEFAULT_CONFIG: ClassNodeConfig = {
  propertiesExpanded: true,
};

/**
 * Load all class-node configs for a version from localStorage.
 */
export function getAllClassNodeConfigs(
  versionId: string
): Record<string, ClassNodeConfig> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(storageKey(versionId));
    if (!raw) return {};
    const data = JSON.parse(raw) as StoredConfig;
    return data.configs ?? {};
  } catch {
    return {};
  }
}

/**
 * Get config for a single class node. Merges with defaults.
 */
export function getClassNodeConfig(
  versionId: string,
  classId: string
): ClassNodeConfig {
  const all = getAllClassNodeConfigs(versionId);
  const saved = all[classId];
  return saved
    ? { ...DEFAULT_CONFIG, ...saved }
    : { ...DEFAULT_CONFIG };
}

/**
 * Persist config for a single class node.
 */
export function saveClassNodeConfig(
  versionId: string,
  classId: string,
  config: ClassNodeConfig
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = getAllClassNodeConfigs(versionId);
    const next = { ...all, [classId]: config };
    const data: StoredConfig = {
      configs: next,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(versionId), JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}
