/**
 * Development-only logging. Lines use a `[MetaNotes:<area>]` prefix so they
 * are easy to filter in the IWSDK browser logs, and they are stripped from
 * production builds by Vite (`import.meta.env.DEV` is false there).
 */
export function devLog(area: string, message: string): void {
  if (import.meta.env.DEV) console.info(`[MetaNotes:${area}] ${message}`);
}
