'use client';

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as Switch from '@radix-ui/react-switch';
import { X, Check, Monitor, Sun, Moon, Contrast } from 'lucide-react';
import { useTheme } from 'next-themes';
import { themes } from '@/app/config/themes';
import {
  useMotionPreferenceOptional,
  type MotionPreference,
} from '@/app/contexts/MotionPreferenceContext';
import { useUserAppearanceOptional } from '@/app/contexts/UserAppearanceContext';
import type { UserThemePreference } from '@lib/ui/userAppearanceMetadata';

interface ThemeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

function getThemeIcon(themeId: string) {
  switch (themeId) {
    case 'system':
      return <Monitor className="w-5 h-5" />;
    case 'light':
      return <Sun className="w-5 h-5" />;
    case 'dark':
      return <Moon className="w-5 h-5" />;
    default:
      return null;
  }
}

const motionOptions: Array<{
  id: MotionPreference;
  name: string;
  description: string;
}> = [
  {
    id: 'system',
    name: 'Match system',
    description: "Use your device's reduced-motion setting when available",
  },
  {
    id: 'reduce',
    name: 'Reduce motion',
    description: 'Minimize animations and transitions',
  },
  {
    id: 'full',
    name: 'Full motion',
    description: 'Play animations even when the system prefers reduced motion',
  },
];

export default function ThemeSelector({ isOpen, onClose }: ThemeSelectorProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const motion = useMotionPreferenceOptional();
  const appearance = useUserAppearanceOptional();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) appearance?.clearPersistError();
  }, [isOpen, appearance]);

  const handleThemeSelect = async (themeId: string) => {
    setTheme(themeId);

    if (
      appearance &&
      (themeId === 'light' || themeId === 'dark' || themeId === 'system')
    ) {
      try {
        await appearance.persistTheme(themeId as UserThemePreference);
      } catch {
        /* persistError set in context; keep dialog open so error is visible */
        return;
      }
    }

    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[80vh] overflow-hidden z-[9999] animate-in focus:outline-none"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Select Theme
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Choose your preferred color theme for the application
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          {/* Theme list */}
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
            <div className="space-y-3">
              {themes.map((option) => {
                const isSelected = theme === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleThemeSelect(option.id)}
                    className={`
                      relative w-full p-4 rounded-xl border-2 transition-all text-left
                      hover:shadow-lg hover:scale-[1.01]
                      ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                      }
                      bg-white dark:bg-slate-900
                    `}
                  >
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {getThemeIcon(option.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          {option.name}
                          {option.id === 'system' && mounted && theme === 'system' && resolvedTheme && (
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                              Currently: {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </div>

                    {/* Color preview */}
                    {option.id === 'system' ? (
                      <div className="mt-3 flex gap-2">
                        <div
                          className="w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 bg-gradient-to-br from-white to-slate-100"
                          title="Light mode"
                        />
                        <div
                          className="w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 bg-gradient-to-br from-slate-700 to-slate-900"
                          title="Dark mode"
                        />
                        <div className="w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-700">
                          <Monitor className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <div
                          className={`w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 ${
                            option.id === 'light' ? 'bg-white' : 'bg-slate-950'
                          }`}
                          title="Background"
                        />
                        <div
                          className="w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 bg-indigo-500"
                          title="Primary"
                        />
                        <div
                          className={`w-8 h-8 rounded-md shadow-sm border border-slate-200 dark:border-slate-600 ${
                            option.id === 'light' ? 'bg-slate-100' : 'bg-slate-800'
                          }`}
                          title="Secondary"
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {appearance && (
            <div className="px-6 pb-2 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-5 pb-1 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Contrast className="w-5 h-5 shrink-0" aria-hidden />
                    High contrast
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Stronger focus outlines and borders for readability
                  </p>
                </div>
                <Switch.Root
                  checked={appearance.highContrast}
                  onCheckedChange={(v) => void appearance.setHighContrast(v)}
                  className="shrink-0 w-11 h-6 rounded-full bg-slate-200 dark:bg-slate-700 relative transition-colors data-[state=checked]:bg-[color:var(--tenant-primary,#6366f1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tenant-primary,#6366f1)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  aria-label="High contrast mode"
                >
                  <Switch.Thumb className="block w-5 h-5 my-0.5 ml-0.5 rounded-full bg-white shadow transition-transform will-change-transform data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
            </div>
          )}

          {appearance?.persistError && (
            <div
              className="mx-6 mb-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
              role="alert"
            >
              {appearance.persistError}
            </div>
          )}

          {motion && (
            <div className="px-6 pb-2 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-5 pb-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Motion
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Optional preference for animations and transitions
                </p>
              </div>
              <RadioGroup.Root
                className="space-y-2 pb-4"
                value={motion.motionPreference}
                onValueChange={(v) => motion.setMotionPreference(v as MotionPreference)}
                aria-label="Motion preference"
              >
                {motionOptions.map((option) => {
                  const selected = motion.motionPreference === option.id;
                  return (
                    <RadioGroup.Item
                      key={option.id}
                      value={option.id}
                      className={`
                        w-full p-3 rounded-xl border-2 transition-all text-left
                        hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                        ${
                          selected
                            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                        }
                        bg-white dark:bg-slate-900
                      `}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {option.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {option.description}
                      </div>
                    </RadioGroup.Item>
                  );
                })}
              </RadioGroup.Root>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

