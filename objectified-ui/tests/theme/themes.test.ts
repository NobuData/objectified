import { themes, getThemeById, getDefaultTheme } from '../../src/app/config/themes';

describe('themes config', () => {
  it('exports an array of themes', () => {
    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBeGreaterThanOrEqual(3);
  });

  it('contains system, light, and dark themes', () => {
    const ids = themes.map((t) => t.id);
    expect(ids).toContain('system');
    expect(ids).toContain('light');
    expect(ids).toContain('dark');
  });

  it('each theme has required properties', () => {
    themes.forEach((theme) => {
      expect(theme).toHaveProperty('id');
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('description');
      expect(theme).toHaveProperty('colors');
      expect(theme).toHaveProperty('cssClass');
      expect(theme.colors).toHaveProperty('background');
      expect(theme.colors).toHaveProperty('foreground');
      expect(theme.colors).toHaveProperty('primary');
      expect(theme.colors).toHaveProperty('border');
    });
  });

  describe('getThemeById', () => {
    it('returns a theme when given a valid id', () => {
      const theme = getThemeById('light');
      expect(theme).toBeDefined();
      expect(theme!.id).toBe('light');
      expect(theme!.name).toBe('Light');
    });

    it('returns undefined for an unknown id', () => {
      const theme = getThemeById('nonexistent');
      expect(theme).toBeUndefined();
    });

    it('returns the system theme', () => {
      const theme = getThemeById('system');
      expect(theme).toBeDefined();
      expect(theme!.id).toBe('system');
      expect(theme!.name).toBe('Follow System');
    });

    it('returns the dark theme', () => {
      const theme = getThemeById('dark');
      expect(theme).toBeDefined();
      expect(theme!.id).toBe('dark');
    });
  });

  describe('getDefaultTheme', () => {
    it('returns the first theme (system)', () => {
      const defaultTheme = getDefaultTheme();
      expect(defaultTheme).toBeDefined();
      expect(defaultTheme.id).toBe('system');
    });
  });

  describe('theme css classes', () => {
    it('system theme has system class', () => {
      const theme = getThemeById('system');
      expect(theme!.cssClass).toBe('system');
    });

    it('light theme has light class', () => {
      const theme = getThemeById('light');
      expect(theme!.cssClass).toBe('light');
    });

    it('dark theme has dark class', () => {
      const theme = getThemeById('dark');
      expect(theme!.cssClass).toBe('dark');
    });
  });
});

