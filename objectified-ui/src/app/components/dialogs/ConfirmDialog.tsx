'use client';

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Checkbox from '@radix-ui/react-checkbox';
import { AlertTriangle, Check, Info, CheckCircle, XCircle } from 'lucide-react';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string | React.ReactNode;
  variant?: ConfirmDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When set with sessionKey in the provider, shows “Don’t ask again this session”. */
  showDontAskAgain?: boolean;
  dontAskAgainLabel?: string;
  onConfirm: (dontAskAgain?: boolean) => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  variant = 'warning',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showDontAskAgain = false,
  dontAskAgainLabel = 'Don’t ask again this session',
  onConfirm,
  onCancel,
}) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (open) setDontAskAgain(false);
  }, [open]);

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <XCircle className="h-6 w-6 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case 'info':
        return <Info className="h-6 w-6 text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-600" />;
    }
  };

  const getConfirmButtonClass = () => {
    const base = 'px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    switch (variant) {
      case 'danger':
        return `${base} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
      case 'warning':
        return `${base} bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500`;
      case 'info':
        return `${base} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
      case 'success':
        return `${base} bg-green-600 text-white hover:bg-green-700 focus:ring-green-500`;
    }
  };

  return (
    <Dialog.Root modal open={open} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
          onEscapeKeyDown={onCancel}
          onPointerDownOutside={onCancel}
        >
          <div className="p-6 pb-2">
            <Dialog.Title className="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {getIcon()}
              <span>{title || 'Confirm Action'}</span>
            </Dialog.Title>
          </div>
          <div className="px-6 py-2 flex-1 overflow-auto">
            {typeof message === 'string' ? (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {message}
              </p>
            ) : (
              <div className="text-gray-700 dark:text-gray-300">{message}</div>
            )}
          </div>
          {showDontAskAgain && (
            <div className="px-6 pb-2 flex items-center gap-2">
              <Checkbox.Root
                id="confirm-dont-ask-again"
                checked={dontAskAgain}
                onCheckedChange={(checked) => setDontAskAgain(checked === true)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
              >
                <Checkbox.Indicator className="flex items-center justify-center text-white">
                  <Check className="h-3 w-3" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <label
                htmlFor="confirm-dont-ask-again"
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                {dontAskAgainLabel}
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2 p-4 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(showDontAskAgain ? dontAskAgain : false)}
              className={getConfirmButtonClass()}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ConfirmDialog;

