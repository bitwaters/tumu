import type { Area, Discipline, Organization, PhotoAttachment, Section, SiteItem, User, WorkflowLog } from "../../types.js";
import { buildExportFileName, safeFileName } from "./fileNames.js";
import { saveGeneratedExportArtifact } from "./artifacts.js";
import { toCsv, type CsvRow } from "./csv.js";

export interface SiteItemLedgerInput {
  requester: User;
  items: SiteItem[];
  photos: PhotoAttachment[];
  workflowLogs: WorkflowLog[];
  sections: Section[];
  areas: Area[];
  disciplines: Discipline[];
  organizations: Organization[];
  users: Array<Pick<User, "id" | "name">>;
  generatedAt: Date;
}

const ledgerHeaders = [
  "编号",
  "类型",
  "状态",
  "等级",
  "标题",
  "描述",
  "标段",
  "区域",
  "专业",
  "责任单位",
  "责任人",
  "提出人",
  "创建时间",
  "截止时间",
  "提交复验时间",
  "关闭时间",
  "是否超期",
  "照片数",
  "最新流程意见"
];

export function canCreateSiteItemLedgerExport(user: User): boolean {
  return user.role === "admin" || user.role === "supervisor" || user.role === "contractor_manager";
}

export function buildSiteItemLedgerExport(input: SiteItemLedgerInput) {
  const rows = input.items.map((item) => ledgerRow(input, item));
  const fileName = buildExportFileName(["site-items", input.requester.username], "csv", input.generatedAt);
  const artifactKey = `exports/${input.requester.id}/${safeFileName(fileName)}`;
  const content = Buffer.from(toCsv(ledgerHeaders, rows), "utf8");

  return saveGeneratedExportArtifact({
    artifactKey,
    fileName,
    mimeType: "text/csv; charset=utf-8",
    content
  });
}

function ledgerRow(input: SiteItemLedgerInput, item: SiteItem): CsvRow {
  return {
    编号: item.itemNo,
    类型: item.type,
    状态: item.status,
    等级: item.severity,
    标题: item.title,
    描述: item.description,
    标段: input.sections.find((section) => section.id === item.sectionId)?.name ?? item.sectionId,
    区域: input.areas.find((area) => area.id === item.areaId)?.name ?? item.areaId,
    专业: input.disciplines.find((discipline) => discipline.id === item.disciplineId)?.name ?? item.disciplineId,
    责任单位: item.responsibleOrgId ? input.organizations.find((organization) => organization.id === item.responsibleOrgId)?.name ?? item.responsibleOrgId : "",
    责任人: item.responsibleUserId ? input.users.find((user) => user.id === item.responsibleUserId)?.name ?? item.responsibleUserId : "",
    提出人: input.users.find((user) => user.id === item.createdBy)?.name ?? item.createdBy,
    创建时间: item.createdAt,
    截止时间: item.dueAt,
    提交复验时间: item.submittedForReviewAt ?? "",
    关闭时间: item.closedAt ?? "",
    是否超期: isOverdue(item, input.generatedAt) ? "是" : "否",
    照片数: input.photos.filter((photo) => photo.siteItemId === item.id && !photo.deletedAt).length,
    最新流程意见: latestWorkflowComment(input.workflowLogs, item.id)
  };
}

function latestWorkflowComment(logs: WorkflowLog[], itemId: string): string {
  return logs
    .filter((log) => log.siteItemId === itemId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.comment ?? "";
}

function isOverdue(item: SiteItem, now: Date): boolean {
  return new Date(item.dueAt).getTime() < now.getTime() && item.status !== "closed" && item.status !== "voided";
}
