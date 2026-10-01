import type { DrawingInterpreter } from "../drawingInterpreter";
import { HeuristicDrawingInterpreter } from "./heuristicInterpreter";
import { MockDrawingInterpreter } from "./mockInterpreter";

/**
 * Registered interpreters. Add an AI-backed implementation here (e.g. a vision
 * model behind an API key) without touching the rest of the app.
 */
const INTERPRETERS: DrawingInterpreter[] = [new HeuristicDrawingInterpreter(), new MockDrawingInterpreter()];

export function listInterpreters() {
  return INTERPRETERS.map(({ id, label, description }) => ({ id, label, description }));
}

export function getInterpreter(id: string): DrawingInterpreter | undefined {
  return INTERPRETERS.find((i) => i.id === id);
}
