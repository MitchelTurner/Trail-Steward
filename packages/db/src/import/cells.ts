import type { Cell } from 'exceljs';

type RichText = { richText: { text: string }[] };
type HyperlinkValue = { text?: string; hyperlink?: string };

function isRichText(value: object): value is RichText {
  return 'richText' in value && Array.isArray((value as RichText).richText);
}

export function cellText(cell: Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (isRichText(value))
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    if ('text' in value && typeof (value as HyperlinkValue).text === 'string') {
      return (value as HyperlinkValue).text?.trim() ?? '';
    }
    if ('result' in value && (value as { result?: unknown }).result != null) {
      return String((value as { result: unknown }).result).trim();
    }
  }
  return cell.text?.trim() ?? '';
}

export function cellHyperlink(cell: Cell): string | null {
  if (typeof cell.hyperlink === 'string' && cell.hyperlink.trim()) return cell.hyperlink.trim();
  const value = cell.value;
  if (value && typeof value === 'object' && 'hyperlink' in value) {
    const link = (value as HyperlinkValue).hyperlink;
    if (typeof link === 'string' && link.trim()) return link.trim();
  }
  return null;
}

export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}
