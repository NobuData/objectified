'use client';

/**
 * Full-screen dialog for code generation (built-in + custom Mustache).
 *
 * Reference: GitHub #120 — preview panel in designer; #119 — templates.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { X, Code2 } from 'lucide-react';
import CodeGenerationPreviewForm from '@/app/dashboard/components/CodeGenerationPreviewForm';

export interface GenerateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GenerateCodeDialog({ open, onOpenChange }: GenerateCodeDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,900px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl flex flex-col overflow-hidden"
          aria-describedby="generate-code-description"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-600 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Generate code
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <p id="generate-code-description" className="sr-only">
            Generate TypeScript, Prisma, GraphQL, Go, Pydantic, SQL, or custom Mustache from the
            current schema.
          </p>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <CodeGenerationPreviewForm variant="dialog" active={open} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
