export type Cond =
  | { q: string; includes: string }
  | { q: string; in: string[] }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export type Answers = Record<string, unknown>;

function warn(message: string): void {
  console.warn(`pathway condition: ${message}`);
}

function isIncludes(cond: Cond): cond is { q: string; includes: string } {
  return 'includes' in cond && 'q' in cond;
}

function isIn(cond: Cond): cond is { q: string; in: string[] } {
  return 'in' in cond && 'q' in cond && !('includes' in cond);
}

export function evaluate(cond: Cond, answers: Answers): boolean {
  if (isIncludes(cond)) {
    const value = answers[cond.q];
    if (!Object.prototype.hasOwnProperty.call(answers, cond.q) || !Array.isArray(value)) {
      warn(`unknown question id "${cond.q}"`);
      return false;
    }
    return value.includes(cond.includes);
  }
  if (isIn(cond)) {
    const value = answers[cond.q];
    if (!Object.prototype.hasOwnProperty.call(answers, cond.q) || typeof value !== 'string') {
      warn(`unknown question id "${cond.q}"`);
      return false;
    }
    return cond.in.includes(value);
  }
  if ('all' in cond) return cond.all.every((item) => evaluate(item, answers));
  if ('any' in cond) return cond.any.some((item) => evaluate(item, answers));
  if ('not' in cond) return !evaluate(cond.not, answers);
  warn('unrecognized condition');
  return false;
}
