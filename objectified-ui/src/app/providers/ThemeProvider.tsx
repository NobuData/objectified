'use client';

/**
 * Thin re-export of next-themes.
 *
 * Per Radix UI docs (https://www.radix-ui.com/themes/docs/theme/dark-mode):
 *   - Use <ThemeProvider attribute="class"> from next-themes.
 *   - Do NOT set <Theme appearance={resolvedTheme}>.
 *   - next-themes applies .light / .dark on <html> which Radix Themes matches.
 *
 * All theme state (theme, resolvedTheme, setTheme, systemTheme) comes from
 * next-themes.  No custom context is needed.
 */
export { useTheme } from 'next-themes';

