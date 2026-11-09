import type { Response } from 'express';

type Cell = string | number | boolean | null | undefined;

/**
 * Cells that start with =, +, - or @ are prefixed with a quote so spreadsheet
 * apps do not evaluate them as formulas (CSV injection).
 */
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function sendCsv(res: Response, filename: string, headers: string[], rows: Cell[][]) {
  res.attachment(filename);
  res.type('text/csv');
  res.send(toCsv(headers, rows));
}
