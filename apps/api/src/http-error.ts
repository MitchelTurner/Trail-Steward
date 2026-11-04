export function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('Invalid `') && !line.includes('invocation'));
  const text = (lines.at(-1) || 'Internal server error')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://redacted')
    .slice(0, 180);
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? `${error.code}: `
      : '';
  return `${code}${text}`;
}
