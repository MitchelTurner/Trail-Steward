export function markdownToPlain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
