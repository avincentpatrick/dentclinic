import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Scale the page-data worker pool to FREE MEMORY, not to core count.
     *
     * Next defaults `experimental.cpus` to `os.cpus().length - 1` and ignores
     * memory entirely, so this 22-core box spawned 18 workers for 17 page-data
     * tasks. With ~2 GB free that dies as `FATAL ERROR: Zone Allocation failed`
     * — reported per worker at a ~26 MB heap, which reads like a Next or
     * component bug and is neither: the machine simply could not commit 18 more
     * node processes.
     *
     * That is the intermittent build crash in PROGRESS.md (2026-08-13), and the
     * reason it looked intermittent is that it tracks whatever else is running.
     * `npm run verify` is the gate before every push, so a gate that fails on
     * memory pressure is a gate that gets ignored.
     *
     * This flag computes `max(min(cpus, freeGB), 4)` — 4 workers when the box is
     * busy, up to 15 when it is not, and 4 on a CI runner. Capping `cpus` to a
     * constant instead would throttle a machine that has room to spare.
     */
    memoryBasedWorkersCount: true,
  },
};

export default nextConfig;
