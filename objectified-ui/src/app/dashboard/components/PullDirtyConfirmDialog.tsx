'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';

export type PullDirtyChoice = 'stash' | 'discard' | 'cancel';

interface PullDirtyConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoice: (choice: PullDirtyChoice) => void;
}

export default function PullDirtyConfirmDialog({
  open,
  onOpenChange,
  onChoice,
}: PullDirtyConfirmDialogProps) {
  const pick = (choice: PullDirtyChoice) => {
    onChoice(choice);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
          onEscapeKeyDown={() => pick('cancel')}
          onPointerDownOutside={() => pick('cancel')}
        >
          <div className="p-6 pb-2">
            <Dialog.Title className="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
              <span>Unsaved local changes</span>
            </Dialog.Title>
          </div>
          <div className="px-6 py-2 flex-1 overflow-auto">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              You have uncommitted edits in the studio. Pull replaces the working copy with
              the latest server state for this version. Choose whether to keep your edits in
              a local stash (you can restore them from the backup flow), discard them
              permanently, or cancel.
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 pt-4">
            <button
              type="button"
              onClick={() => pick('cancel')}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => pick('discard')}
              className="px-4 py-2 rounded-lg border border-amber-600 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
            >
              Discard and pull
            </button>
            <button
              type="button"
              onClick={() => pick('stash')}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
            >
              Stash and pull
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
