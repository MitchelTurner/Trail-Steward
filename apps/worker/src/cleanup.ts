/** Checklists untouched for 18 months are deleted. */
export function cleanupCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 18);
  return cutoff;
}
