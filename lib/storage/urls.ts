/** Browser-safe URL for a stored object (served by app/api/files/[...key]). */
export function fileUrl(key: string) {
  return `/api/files/${key}`;
}
