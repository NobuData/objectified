'use client';

/**
 * Dialog to edit group name, nesting, metadata, color/border/icon, and templates (GitHub #237).
 */

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import { X } from 'lucide-react';
import type { StudioGroup } from '@lib/studio/types';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
import {
  getStrictDescendantGroupIds,
  wouldCreateGroupParentCycle,
} from '@lib/studio/canvasGroupLayout';

export interface GroupDialogSavePayload {
  name: string;
  style: Record<string, string | number>;
  parentGroupId: string | null;
  description: string;
  owner: string;
  governanceTag: string;
}

export interface GroupDialogProps {
  open: boolean;
  group: StudioGroup | null;
  allGroups: StudioGroup[];
  onSave: (payload: GroupDialogSavePayload) => void;
  /** Called when user clicks Delete group. Return true if group was deleted (dialog should close), false to keep it open. */
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
}

const PRESET_COLORS = [
  { label: 'Default', bg: '', border: '' },
  { label: 'Blue', bg: 'rgb(219 234 254)', border: 'rgb(59 130 246)' },
  { label: 'Green', bg: 'rgb(220 252 231)', border: 'rgb(34 197 94)' },
  { label: 'Amber', bg: 'rgb(254 243 199)', border: 'rgb(245 158 11)' },
  { label: 'Violet', bg: 'rgb(237 233 254)', border: 'rgb(139 92 246)' },
];

const GROUP_TEMPLATES: {
  id: string;
  label: string;
  name: string;
  bg: string;
  border: string;
  governanceTag?: string;
}[] = [
  {
    id: 'domain-order',
    label: 'Domain: Order',
    name: 'Domain: Order',
    bg: 'rgb(254 243 199)',
    border: 'rgb(217 119 6)',
    governanceTag: 'domain',
  },
  {
    id: 'layer-api',
    label: 'Layer: API',
    name: 'Layer: API',
    bg: 'rgb(219 234 254)',
    border: 'rgb(37 99 235)',
    governanceTag: 'layer',
  },
  {
    id: 'bounded-context',
    label: 'Bounded context',
    name: 'Bounded context',
    bg: 'rgb(220 252 231)',
    border: 'rgb(21 128 61)',
  },
];

function metaOf(g: StudioGroup): GroupCanvasMetadata {
  return (g.metadata ?? {}) as GroupCanvasMetadata;
}

export default function GroupDialog({
  open,
  group,
  allGroups,
  onSave,
  onDelete,
  onClose,
}: GroupDialogProps) {
  const [name, setName] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [borderColor, setBorderColor] = useState('');
  const [borderStyle, setBorderStyle] = useState<string>('solid');
  const [headerIcon, setHeaderIcon] = useState<string>('');
  const [parentGroupId, setParentGroupId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [governanceTag, setGovernanceTag] = useState('');
  const [error, setError] = useState('');

  const excludedParentIds = useMemo(() => {
    if (!group) return new Set<string>();
    const desc = getStrictDescendantGroupIds(allGroups, group.id);
    desc.add(group.id);
    return desc;
  }, [group, allGroups]);

  const parentChoices = useMemo(
    () => allGroups.filter((g) => !excludedParentIds.has(g.id)),
    [allGroups, excludedParentIds]
  );

  useEffect(() => {
    if (open && group) {
      const style = (metaOf(group).style as Record<string, string> | undefined) ?? {};
      setName(group.name);
      setBackgroundColor(String(style.backgroundColor ?? ''));
      setBorderColor(String(style.border ?? ''));
      setBorderStyle(String(style.borderStyle ?? 'solid'));
      setHeaderIcon(String(style.headerIcon ?? ''));
      setParentGroupId(metaOf(group).parentGroupId ?? '');
      setDescription(metaOf(group).description ?? '');
      setOwner(metaOf(group).owner ?? '');
      setGovernanceTag(metaOf(group).governanceTag ?? '');
      setError('');
    }
  }, [open, group]);

  const handleSave = () => {
    if (!group) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Group name is required.');
      return;
    }
    const parent: string | null = parentGroupId.trim() || null;
    if (wouldCreateGroupParentCycle(allGroups, group.id, parent)) {
      setError('That parent group would create a cycle.');
      return;
    }
    setError('');
    const style: Record<string, string | number> = {};
    if (backgroundColor.trim()) style.backgroundColor = backgroundColor.trim();
    if (borderColor.trim()) style.border = borderColor.trim();
    if (borderStyle && borderStyle !== 'solid') style.borderStyle = borderStyle;
    if (headerIcon.trim()) style.headerIcon = headerIcon.trim();
    onSave({
      name: trimmed,
      style,
      parentGroupId: parent,
      description: description.trim(),
      owner: owner.trim(),
      governanceTag: governanceTag.trim(),
    });
  };

  const applyTemplate = (t: (typeof GROUP_TEMPLATES)[number]) => {
    setName(t.name);
    setBackgroundColor(t.bg);
    setBorderColor(t.border);
    setBorderStyle('solid');
    setHeaderIcon('');
    if (t.governanceTag) setGovernanceTag(t.governanceTag);
    setError('');
  };

  if (!group) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Edit group
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col gap-4 px-6 py-4 overflow-auto">
            <div className="grid gap-2">
              <Label.Root htmlFor="group-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Name
              </Label.Root>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                placeholder="Group name"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-parent" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Parent group (nested)
              </Label.Root>
              <select
                id="group-parent"
                value={parentGroupId}
                onChange={(e) => setParentGroupId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="">None (top level)</option>
                {parentChoices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Templates
              </Label.Root>
              <div className="flex flex-wrap gap-2">
                {GROUP_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Color presets
              </Label.Root>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setBackgroundColor(preset.bg);
                      setBorderColor(preset.border);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    title={preset.label}
                    style={
                      preset.bg || preset.border
                        ? { backgroundColor: preset.bg || undefined, borderColor: preset.border || undefined }
                        : undefined
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-bg" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Background color
              </Label.Root>
              <input
                id="group-bg"
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono"
                placeholder="e.g. rgb(219 234 254)"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-border" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Border color
              </Label.Root>
              <input
                id="group-border"
                type="text"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono"
                placeholder="e.g. rgb(59 130 246)"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-border-style" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Border style
              </Label.Root>
              <select
                id="group-border-style"
                value={borderStyle}
                onChange={(e) => setBorderStyle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-icon" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Header icon
              </Label.Root>
              <select
                id="group-icon"
                value={headerIcon}
                onChange={(e) => setHeaderIcon(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="">None</option>
                <option value="box">Box</option>
                <option value="circle">Circle</option>
                <option value="square">Square</option>
                <option value="hexagon">Hexagon</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-desc" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Description
              </Label.Root>
              <textarea
                id="group-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm resize-y min-h-[3rem]"
                placeholder="Purpose, scope, or notes"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-owner" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Owner
              </Label.Root>
              <input
                id="group-owner"
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                placeholder="Team or person"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-gov-tag" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Governance tag
              </Label.Root>
              <input
                id="group-gov-tag"
                type="text"
                value={governanceTag}
                onChange={(e) => setGovernanceTag(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                placeholder="Filter / label (not class tags)"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={async () => {
                    const deleted = await onDelete();
                    if (deleted !== false) onClose();
                  }}
                  className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm font-medium"
                >
                  Delete group
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
