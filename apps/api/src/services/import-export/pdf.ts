import type { PhotoAttachment, SiteItem, WorkflowLog } from "../../types.js";

export interface CloseoutPdfInput {
  item: SiteItem;
  workflowLogs: WorkflowLog[];
  photos: PhotoAttachment[];
  generatedAt: Date;
}

export function buildCloseoutPdf(input: CloseoutPdfInput): Uint8Array {
  const lines = [
    "Site Item Closeout Sheet",
    `Generated At: ${input.generatedAt.toISOString()}`,
    `Item No: ${input.item.itemNo}`,
    `Title: ${input.item.title}`,
    `Type: ${input.item.type}`,
    `Status: ${input.item.status}`,
    `Severity: ${input.item.severity}`,
    `Description: ${input.item.description}`,
    `Location: ${input.item.locationText}`,
    `Responsible Org: ${input.item.responsibleOrgId ?? "-"}`,
    `Responsible User: ${input.item.responsibleUserId ?? "-"}`,
    `Due At: ${input.item.dueAt}`,
    "",
    "Workflow Logs",
    ...input.workflowLogs.map((log) => `${log.createdAt} | ${log.action} | ${log.actorId} | ${log.comment}`),
    "",
    "Photo Manifest",
    ...input.photos.map((photo) => `${photo.stage ?? "unbound"} | ${photo.fileName} | ${photo.uploadedBy} | ${photo.uploadedAt}`)
  ];

  return renderSimplePdf(lines);
}

function renderSimplePdf(lines: string[]): Uint8Array {
  const textCommands = lines.flatMap((line, index) => {
    const y = 760 - index * 16;
    if (y < 40) return [];
    return [`BT /F1 10 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`];
  });
  const stream = textCommands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "utf8");
}

function escapePdfText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function byteLength(text: string): number {
  return Buffer.from(text, "utf8").length;
}
