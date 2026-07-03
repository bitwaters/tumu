import type { PhotoAttachment, SiteItem, User, WorkflowLog } from "../../types.js";
import { buildCloseoutPdf } from "./pdf.js";
import { buildExportFileName, safeFileName } from "./fileNames.js";
import { saveGeneratedExportArtifact } from "./artifacts.js";

export interface CloseoutPdfExportInput {
  requester: User;
  item: SiteItem;
  workflowLogs: WorkflowLog[];
  photos: PhotoAttachment[];
  generatedAt: Date;
}

export function buildCloseoutPdfExport(input: CloseoutPdfExportInput) {
  const content = buildCloseoutPdf({
    item: input.item,
    workflowLogs: input.workflowLogs,
    photos: input.photos,
    generatedAt: input.generatedAt
  });
  const fileName = buildExportFileName(["closeout", input.item.itemNo], "pdf", input.generatedAt);

  return saveGeneratedExportArtifact({
    artifactKey: `exports/${input.requester.id}/${safeFileName(fileName)}`,
    fileName,
    mimeType: "application/pdf",
    content
  });
}
