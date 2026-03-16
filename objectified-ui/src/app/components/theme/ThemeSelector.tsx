'use client';

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Monitor, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { themes } from '@/app/config/themes';

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

export default function ThemeSelector({ isOpen, onClose }: ThemeSelectorProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId);
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

