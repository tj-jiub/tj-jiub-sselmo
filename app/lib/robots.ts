/** Paths that must never be indexed: the admin console and the owner area. */
export function needsNoindex(pathname: string): boolean {
  return /^\/(admin|owner)(\/|$)/.test(pathname);
}
