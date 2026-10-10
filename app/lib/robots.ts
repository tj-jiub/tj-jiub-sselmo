/** Paths that must never be indexed: the admin console and the owner area (including React Router single-fetch `.data` URLs). */
export function needsNoindex(pathname: string): boolean {
  return /^\/(admin|owner)(\/|\.data$|$)/.test(pathname);
}
