/**
 * Gallery group vocabulary, kept free of JSX so the Playwright specs can import
 * it too. Without that, the a11y run hardcodes a list that silently rots the
 * first time a group is added — and a group nobody tests is a group nobody
 * checks for contrast.
 */
export type GalleryGroup = "shell" | "shared" | "search" | "feedback";

export const GALLERY_GROUPS: readonly GalleryGroup[] = [
  "shell",
  "shared",
  "search",
  "feedback",
] as const;

export const GROUP_LABELS: Record<GalleryGroup, string> = {
  shell: "Shell",
  shared: "Shared",
  search: "Search",
  /** UI feedback — skeletons, alerts, toasts. NOT the bug-report module. */
  feedback: "Feedback",
};

export function parseGroup(value: unknown): GalleryGroup | null {
  return GALLERY_GROUPS.includes(value as GalleryGroup) ? (value as GalleryGroup) : null;
}
