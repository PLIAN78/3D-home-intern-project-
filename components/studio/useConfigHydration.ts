"use client";

import { useEffect } from "react";
import type { PlanSelection } from "@/lib/models/planSet";
import { decodeJson, decodeSelections, useProjectStore } from "@/stores/projectStore";

/**
 * Load persisted selections after mount (avoids SSR hydration mismatches),
 * then apply any configuration carried in a share link (?c=…).
 */
export function useConfigHydration(projectId: string, encoded?: string | null, planEncoded?: string | null) {
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(useProjectStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      if (encoded) {
        const sel = decodeSelections(encoded);
        if (Object.keys(sel).length) useProjectStore.getState().applySelections(projectId, sel);
      }
      // Elevation / layout from a share link (validated against the plan set when used).
      const plan = planEncoded ? decodeJson<PlanSelection>(planEncoded) : null;
      if (plan?.elevationId) useProjectStore.getState().setPlanSelection(projectId, { elevationId: String(plan.elevationId), options: plan.options ?? {} });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, encoded, planEncoded]);
}
