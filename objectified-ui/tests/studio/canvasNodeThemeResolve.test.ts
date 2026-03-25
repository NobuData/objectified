/**
 * Reference: GitHub #230 — Tag/tenant node theme resolution
 */

import {
  mergeClassNodeThemes,
  resolveAutoClassNodeTheme,
  DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS,
} from '@lib/studio/canvasNodeThemeResolve';

describe('resolveAutoClassNodeTheme', () => {
  it('uses first tag color when applyTagColorsToNodes is true', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: ['core', 'other'],
      tagDefinitions: {
        core: { color: '#3366cc' },
        other: { color: '#ff0000' },
      },
      tenantPrimaryColor: null,
      prefs: { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS, applyTagColorsToNodes: true },
    });
    expect(theme?.border).toBe('#3366cc');
    expect(theme?.borderStyle).toBe('solid');
  });

  it('respects tag borderStyle and custom border', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: ['x'],
      tagDefinitions: {
        x: { border: '#111', borderStyle: 'dashed' },
      },
      tenantPrimaryColor: null,
      prefs: { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS, applyTagColorsToNodes: true },
    });
    expect(theme?.border).toBe('#111');
    expect(theme?.borderStyle).toBe('dashed');
  });

  it('sets icon from tag definition', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: ['svc'],
      tagDefinitions: { svc: { color: '#000', icon: 'hexagon' } },
      tenantPrimaryColor: null,
      prefs: { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS, applyTagColorsToNodes: true },
    });
    expect(theme?.icon).toBe('hexagon');
  });

  it('applies tenant primary when enabled and no tag match', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: [],
      tagDefinitions: {},
      tenantPrimaryColor: '#aa00bb',
      prefs: {
        applyTagColorsToNodes: true,
        useTenantPrimaryAccent: true,
      },
    });
    expect(theme?.border).toBe('#aa00bb');
  });

  it('tag styling overrides tenant accent', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: ['t1'],
      tagDefinitions: { t1: { color: '#00ff00' } },
      tenantPrimaryColor: '#aa00bb',
      prefs: {
        applyTagColorsToNodes: true,
        useTenantPrimaryAccent: true,
      },
    });
    expect(theme?.border).toBe('#00ff00');
  });

  it('returns undefined when prefs disable both sources', () => {
    const theme = resolveAutoClassNodeTheme({
      tags: ['t'],
      tagDefinitions: { t: { color: '#fff' } },
      tenantPrimaryColor: '#000',
      prefs: { applyTagColorsToNodes: false, useTenantPrimaryAccent: false },
    });
    expect(theme).toBeUndefined();
  });
});

describe('mergeClassNodeThemes', () => {
  it('override wins per field', () => {
    const merged = mergeClassNodeThemes(
      { border: '#111', backgroundColor: 'a', icon: 'box' },
      { border: '#222' }
    );
    expect(merged?.border).toBe('#222');
    expect(merged?.backgroundColor).toBe('a');
    expect(merged?.icon).toBe('box');
  });
});
