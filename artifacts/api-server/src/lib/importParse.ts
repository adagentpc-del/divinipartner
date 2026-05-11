import Papa from "papaparse";
import * as XLSX from "@e965/xlsx";

export type ParsedSheet = { headers: string[]; rows: Record<string, unknown>[]; rowCount: number };

export function parseBuffer(buf: Buffer, filename: string): ParsedSheet {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = buf.toString("utf8").replace(/^\uFEFF/, "");
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h: string) => h.trim(),
    });
    const headers: string[] = (result.meta.fields || []).map(h => h.trim());
    const rows = (result.data as Record<string, string>[]).filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ""));
    return { headers, rows, rowCount: rows.length };
  }
  // XLSX / XLS
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], rowCount: 0 };
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const headers = json.length > 0 ? Object.keys(json[0]).map(h => String(h).trim()) : [];
  const rows = json.filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ""));
  return { headers, rows, rowCount: rows.length };
}

export function buildCsvTemplate(headers: string[], samples: Record<string, string>[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const s of samples) {
    lines.push(headers.map(h => csvEscape(s[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
