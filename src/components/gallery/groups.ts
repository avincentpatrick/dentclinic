/**
 * Gallery group vocabulary, kept free of JSX so the Playwright specs can import
 * it too. Without that, the a11y run hardcodes a list that silently rots the
 * first time a group is added — and a group nobody tests is a group nobody
 * checks for contrast.
 */
export type GalleryGroup = "shell" | "shared" | "search" | "feedback" | "layouts";

export const GALLERY_GROUPS: readonly GalleryGroup[] = [
  "shell",
  "shared",
  "search",
  "feedback",
  // Last, so the gallery reads primitives first and compositions after.
  "layouts",
] as const;

export const GROUP_LABELS: Record<GalleryGroup, string> = {
  shell: "Shell",
  shared: "Shared",
  search: "Search",
  /** UI feedback — skeletons, alerts, toasts. NOT the bug-report module. */
  feedback: "Feedback",
  /**
   * Whole-page compositions, built from the same presentational pieces the real
   * screens render — never a re-typed copy, which would drift within an
   * increment. This is how authenticated screens get axe coverage without a
   * second bypass route: the gallery is already reachable under A11Y_AUDIT,
   * and a composition here goes through the full matrix (2 themes x 4 font
   * steps) like any other specimen.
   *
   * What it proves: heading order, contrast and layout of the assembled page.
   * What it does NOT prove: the real data path, row menus whose props are
   * server actions, or the authenticated shell around it.
   */
  layouts: "Layouts",
};

export function parseGroup(value: unknown): GalleryGroup | null {
  return GALLERY_GROUPS.includes(value as GalleryGroup) ? (value as GalleryGroup) : null;
}
