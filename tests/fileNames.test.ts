import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Windows and macOS file systems ignore letter case, so "./shores" can resolve
// to shores.ts or Shores.tsx depending on the machine. Keep module names unique
// regardless of case and extension.
const ROOT = join(__dirname, "..", "game", "src");
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (CODE.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

describe("module file names", () => {
  it("never differ only by letter case or extension", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const file of walk(ROOT)) {
      const key = file.replace(CODE, "").toLowerCase();
      const other = seen.get(key);
      if (other) clashes.push(`${other} <-> ${file}`);
      else seen.set(key, file);
    }
    expect(clashes).toEqual([]);
  });
});
