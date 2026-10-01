"use client";

import { useEffect } from "react";
import { decodeSelections, useProjectStore } from "@/stores/projectStore";

/**
 * Load persisted selections after mount (avoids SSR hydration mismatches),
 * then apply any configuration carried in a share link (?c=…).
 */
export function useConfigHydration(projectId: string, encoded?: string | null) {
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(useProjectStore.persist.rehydrate()).then(() => {
      if (cancelled || !encoded) return;
      const sel = decodeSelections(encoded);
      if (Object.keys(sel).length) useProjectStore.getState().applySelections(projectId, sel);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, encoded]);
}
