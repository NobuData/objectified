/**
 * Application-wide theme configuration
 * Supports light, dark, and system themes.
 */

export interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentForeground: string;
  card: string;
  cardForeground: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  cssClass: string;
}

export const themes: Theme[] = [
  {
    id: 'system',
    name: 'Follow System',
    description: 'Automatically matches your system light/dark preference',
    cssClass: 'theme-system',
    colors: {
      background: '#ffffff',
      foreground: '#171717',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      muted: '#f8fafc',
      mutedForeground: '#64748b',
      border: '#e2e8f0',
      accent: '#f1f5f9',
      accentForeground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#171717',
    },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Clean and bright default theme',
    cssClass: 'theme-light',
    colors: {
      background: '#ffffff',
      foreground: '#171717',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      muted: '#f8fafc',
      mutedForeground: '#64748b',
      border: '#e2e8f0',
      accent: '#f1f5f9',
      accentForeground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#171717',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Easy on the eyes for low-light environments',
    cssClass: 'theme-dark',
    colors: {
      background: '#0a0a0a',
      foreground: '#ededed',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#1e293b',
      secondaryForeground: '#f8fafc',
      muted: '#1e293b',
      mutedForeground: '#94a3b8',
      border: '#334155',
      accent: '#1e293b',
      accentForeground: '#f8fafc',
      card: '#0f172a',
      cardForeground: '#ededed',
    },
  },
];

export const getThemeById = (id: string): Theme | undefined => {
  return themes.find((theme) => theme.id === id);
};

export const getDefaultTheme = (): Theme => {
  return themes[0]; // system theme
};

