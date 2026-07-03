import type { AuditLog, User } from "../../types.js";
import { toCsv } from "./csv.js";
import { buildExportFileName, safeFileName } from "./fileNames.js";
import { saveGeneratedExportArtifact } from "./artifacts.js";

export interface AuditExportInput {
  requester: User;
  logs: AuditLog[];
  generatedAt: Date;
}

const auditHeaders = ["时间", "用户", "操作", "资源类型", "资源ID", "元数据"];

export function buildAuditExport(input: AuditExportInput) {
  const content = Buffer.from(
    toCsv(
      auditHeaders,
      input.logs.map((log) => ({
        时间: log.createdAt,
        用户: log.actorId,
        操作: log.action,
        资源类型: log.resourceType,
        资源ID: log.resourceId,
        元数据: log.metadata ? JSON.stringify(log.metadata) : ""
      }))
    ),
    "utf8"
  );
  const fileName = buildExportFileName(["audit", input.requester.username], "csv", input.generatedAt);

  return saveGeneratedExportArtifact({
    artifactKey: `exports/${input.requester.id}/${safeFileName(fileName)}`,
    fileName,
    mimeType: "text/csv; charset=utf-8",
    content
  });
}
