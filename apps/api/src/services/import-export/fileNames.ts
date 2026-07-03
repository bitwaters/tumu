export function safeFileName(input: string, fallback = "export"): string {
  const normalized = input
    .trim()
    .replaceAll(/[\\/:*?"<>|]+/g, "-")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^\.+/, "")
    .replaceAll(/^-|-$/g, "");
  return normalized || fallback;
}

export function timestampSuffix(date: Date): string {
  return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildExportFileName(parts: string[], extension: string, date = new Date()): string {
  const base = safeFileName([...parts, timestampSuffix(date)].filter(Boolean).join("-"));
  const cleanExtension = extension.replace(/^\.+/, "");
  return `${base}.${cleanExtension}`;
}
