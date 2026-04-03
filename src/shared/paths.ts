import path from "node:path";

export function resolvePath(value: string) {
  return path.resolve(value);
}
