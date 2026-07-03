export type CsvRow = Record<string, unknown>;

export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = value instanceof Date ? value.toISOString() : neutralizeSpreadsheetFormula(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function neutralizeSpreadsheetFormula(value: unknown): string {
  if (typeof value !== "string") return String(value);
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let inQuotes = false;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && next === "\n") index += 2;
      else index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((cell) => cell.length > 0));
}

export function csvRowsToObjects(rows: string[][]): CsvRow[] {
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), row[index]?.trim() ?? ""]))
  );
}
