/**
 * Minimal RFC-4180-ish CSV parser — enough for the OurAirports exports.
 *
 * Hand-rolled (no dependency, per the phase constraints). Handles quoted
 * fields, embedded commas, escaped quotes ("") and quoted newlines. Returns
 * rows of raw string cells; callers map the header.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore — handled by the following \n
    } else {
      field += ch;
    }
  }

  // Flush the trailing field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Build a header-name → column-index lookup from the first row. */
export function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, i) => map.set(name.trim(), i));
  return map;
}
