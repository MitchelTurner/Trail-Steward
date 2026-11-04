import { evaluate, type Answers, type Cond } from './conditions';

export type StepLike = {
  key: string;
  sortOrder: number;
  prerequisiteKeys: string[];
  showIf: Cond | null;
};

export function visibleSteps<T extends StepLike>(steps: T[], answers: Answers): T[] {
  return steps.filter((step) => step.showIf == null || evaluate(step.showIf, answers));
}

/**
 * Kahn's algorithm. Ready nodes are taken in sortOrder, then key.
 * Prerequisite keys that are not in the visible set are ignored.
 */
export function orderSteps<T extends StepLike>(steps: T[]): T[] {
  const byKey = new Map(steps.map((step) => [step.key, step]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    indegree.set(step.key, 0);
    dependents.set(step.key, []);
  }
  for (const step of steps) {
    for (const key of step.prerequisiteKeys) {
      if (!byKey.has(key) || key === step.key) continue;
      dependents.get(key)?.push(step.key);
      indegree.set(step.key, (indegree.get(step.key) ?? 0) + 1);
    }
  }

  const sortReady = (items: T[]) =>
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

  const ready = sortReady(steps.filter((step) => (indegree.get(step.key) ?? 0) === 0));
  const ordered: T[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (!next) break;
    ordered.push(next);
    for (const childKey of dependents.get(next.key) ?? []) {
      const remaining = (indegree.get(childKey) ?? 1) - 1;
      indegree.set(childKey, remaining);
      if (remaining === 0) {
        const child = byKey.get(childKey);
        if (child) {
          ready.push(child);
          sortReady(ready);
        }
      }
    }
  }

  if (ordered.length < steps.length) {
    const seen = new Set(ordered.map((step) => step.key));
    const rest = [...steps]
      .filter((step) => !seen.has(step.key))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    ordered.push(...rest);
  }
  return ordered;
}

export function selectSteps<T extends StepLike>(steps: T[], answers: Answers): T[] {
  return orderSteps(visibleSteps(steps, answers));
}

/** Prerequisites that are on this checklist. A hidden step does not hold a later one. */
export function visiblePrerequisites<T extends StepLike>(step: T, visible: T[]): T[] {
  const byKey = new Map(visible.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const found: T[] = [];
  for (const key of step.prerequisiteKeys) {
    const earlier = byKey.get(key);
    if (!earlier || earlier.key === step.key || seen.has(earlier.key)) continue;
    seen.add(earlier.key);
    found.push(earlier);
  }
  return found;
}
