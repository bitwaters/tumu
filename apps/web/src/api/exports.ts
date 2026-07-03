import type { AuditLogQuery } from "./audit.js";
import type { ApiClient } from "./client.js";
import type { ExportJob, ImportJob, ImportKind } from "../types.js";
import type { SiteItemListQuery } from "./siteItems.js";

export interface ExportDownload {
  fileName: string;
  mimeType: string;
  contentBase64?: string;
  downloadUrl?: string;
  expiresInSeconds?: number;
}

export class ExportsApi {
  constructor(private readonly client: ApiClient) {}

  createSiteItemLedger(query: SiteItemListQuery = {}): Promise<ExportJob> {
    return this.client.post<ExportJob>("/exports/site-items", query);
  }

  createPhotoPackage(query: SiteItemListQuery = {}): Promise<ExportJob> {
    return this.client.post<ExportJob>("/exports/photo-package", query);
  }

  createCloseoutPdf(itemId: string): Promise<ExportJob> {
    return this.client.post<ExportJob>(`/exports/site-items/${itemId}/pdf`, {});
  }

  createAuditExport(query: AuditLogQuery = {}): Promise<ExportJob> {
    return this.client.post<ExportJob>("/exports/audit", query);
  }

  getExportJob(jobId: string): Promise<ExportJob> {
    return this.client.get<ExportJob>(`/exports/${jobId}`);
  }

  downloadExport(jobId: string): Promise<ExportDownload> {
    return this.client.get<ExportDownload>(`/exports/${jobId}/download`);
  }

  createImport(kind: ImportKind, input: { csvText: string; sourceFileName?: string }, idempotencyKey: string): Promise<ImportJob> {
    return this.client.post<ImportJob>(`/imports/${kind}`, input, { idempotencyKey });
  }

  getImportJob(jobId: string): Promise<ImportJob> {
    return this.client.get<ImportJob>(`/imports/${jobId}`);
  }
}
