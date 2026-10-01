import type { DrawingCategory, ProcessingStatus } from "@/lib/models/drawing";
import type { Floor } from "@/lib/models/house";

/** Best-effort category from a filename; the user can always change it. */
export function guessCategory(fileName: string): DrawingCategory {
  const n = fileName.toLowerCase();
  if (/redline|red-line|markup|\brl\b/.test(n)) return "redline";
  if (/elev/.test(n)) return "elevation";
  if (/decor|décor|interior|finish/.test(n)) return "decor";
  if (/struct|framing|foundation|\bs-?\d/.test(n)) return "structural";
  return "floor-plan";
}

/** Match a filename to a floor ("main", "2nd", "basement"…). */
export function guessFloorId(fileName: string, floors: Floor[]): string | undefined {
  const n = fileName.toLowerCase();
  const tests: [RegExp, (f: Floor) => boolean][] = [
    [/basement|lower|cellar|\bb\b/, (f) => !!f.belowGrade],
    [/second|2nd|upper|level-?2|\b2f\b/, (f) => f.shortName === "2" || /second/i.test(f.name)],
    [/third|3rd|level-?3/, (f) => f.shortName === "3" || /third/i.test(f.name)],
    [/main|ground|first|1st|level-?1|\b1f\b/, (f) => f.shortName === "1" || /main|ground/i.test(f.name)],
  ];
  for (const [re, pick] of tests) if (re.test(n)) return floors.find(pick)?.id;
  return undefined;
}

export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  "not-started": "Not interpreted",
  processing: "Interpreting…",
  "needs-review": "Needs review",
  reviewed: "Reviewed",
  failed: "Interpretation failed",
  "not-applicable": "Reference only",
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
