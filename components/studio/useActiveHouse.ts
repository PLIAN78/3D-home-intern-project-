"use client";

import { useCallback, useMemo } from "react";
import type { ProjectBundle } from "@/lib/data/repository";
import { composeHouseModel, sanitizeSelection, type PlanSelection } from "@/lib/models/planSet";
import { usePlanSelectionRaw, useProjectStore } from "@/stores/projectStore";

/**
 * The home currently being shown: for drawing-set projects it is composed
 * from the selected elevation + layout options (standard by default);
 * otherwise it's the saved model.
 */
export function useActiveHouse(bundle: ProjectBundle) {
  const { project, planSet } = bundle;
  const raw = usePlanSelectionRaw(project.id);
  const selection = useMemo(() => (planSet ? sanitizeSelection(planSet, raw) : null), [planSet, raw]);
  const house = useMemo(
    () => (planSet && selection ? composeHouseModel(planSet, selection, { id: bundle.house.id, projectId: project.id, name: bundle.house.name }) : bundle.house),
    [planSet, selection, bundle.house, project.id],
  );
  const setPlanSelection = useProjectStore((s) => s.setPlanSelection);
  const setSelection = useCallback((sel: PlanSelection) => setPlanSelection(project.id, sel), [setPlanSelection, project.id]);
  const active = useMemo<ProjectBundle>(() => ({ ...bundle, house }), [bundle, house]);
  return { bundle: active, selection, setSelection };
}
