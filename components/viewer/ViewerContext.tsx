"use client";

import { createContext, useContext } from "react";

interface ViewerContextValue {
  projectId: string;
  /** Allow clicking surfaces to open their configurator category. */
  interactive: boolean;
}

const ViewerContext = createContext<ViewerContextValue>({ projectId: "", interactive: true });

export const ViewerContextProvider = ViewerContext.Provider;

export function useViewerContext() {
  return useContext(ViewerContext);
}
