import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SELECTIONS, getMaterialOption, isMaterialSlotId, type MaterialSelections, type MaterialSlotId } from "@/lib/models/materials";

/**
 * Customer configuration state: the selected material option per slot, kept
 * per project. Persisted to localStorage for the MVP; the server-side
 * CustomerConfiguration table replaces this in the persistence phase.
 */
interface ProjectState {
  selectionsByProject: Record<string, MaterialSelections>;
  savedAtByProject: Record<string, string>;
  setOption: (projectId: string, slot: MaterialSlotId, optionId: string) => void;
  applySelections: (projectId: string, selections: Partial<MaterialSelections>) => void;
  resetSelections: (projectId: string) => void;
  markSaved: (projectId: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      selectionsByProject: {},
      savedAtByProject: {},
      setOption: (projectId, slot, optionId) =>
        set((s) => ({
          selectionsByProject: {
            ...s.selectionsByProject,
            [projectId]: { ...DEFAULT_SELECTIONS, ...s.selectionsByProject[projectId], [slot]: optionId },
          },
        })),
      applySelections: (projectId, selections) =>
        set((s) => ({
          selectionsByProject: {
            ...s.selectionsByProject,
            [projectId]: { ...DEFAULT_SELECTIONS, ...s.selectionsByProject[projectId], ...sanitize(selections) },
          },
        })),
      resetSelections: (projectId) => set((s) => ({ selectionsByProject: { ...s.selectionsByProject, [projectId]: { ...DEFAULT_SELECTIONS } } })),
      markSaved: (projectId) => set((s) => ({ savedAtByProject: { ...s.savedAtByProject, [projectId]: new Date().toISOString() } })),
    }),
    {
      name: "home-studio:configurations",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
    },
  ),
);

/** Drop unknown slots / options (e.g. from a stale share link). */
export function sanitize(selections: Partial<Record<string, string>>): Partial<MaterialSelections> {
  const out: Partial<MaterialSelections> = {};
  for (const [slot, id] of Object.entries(selections)) {
    if (!id || !isMaterialSlotId(slot)) continue;
    const opt = getMaterialOption(id);
    if (opt && opt.category === slot) out[slot] = id;
  }
  return out;
}

const EMPTY: MaterialSelections = DEFAULT_SELECTIONS;

export function useSelections(projectId: string): MaterialSelections {
  return useProjectStore((s) => s.selectionsByProject[projectId] ?? EMPTY);
}

export function useSelection(projectId: string, slot: MaterialSlotId): string {
  return useProjectStore((s) => s.selectionsByProject[projectId]?.[slot] ?? DEFAULT_SELECTIONS[slot]);
}

/** Compact, URL-safe encoding of a configuration for share links. */
export function encodeSelections(sel: MaterialSelections): string {
  const json = JSON.stringify(sel);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSelections(encoded: string): Partial<MaterialSelections> {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64)));
    return sanitize(JSON.parse(json));
  } catch {
    return {};
  }
}
