import {
  areas,
  disciplines,
  organizations,
  photos,
  sections,
  users,
  workflowLogs
} from "./mockData";
import type {
  Area,
  DashboardSummary,
  Organization,
  PhotoAttachment,
  Role,
  Severity,
  SiteItem,
  SiteItemStatus,
  SiteItemType,
  User,
  WorkflowAction,
  WorkflowLog
} from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export const statusText: Record<SiteItemStatus, string> = {
  pending_approval: "待审核",
  dispatched: "已派发",
  rectifying: "整改中",
  pending_acceptance: "待复验",
  closed: "已关闭",
  voided: "已作废"
};

export const severityText: Record<Severity, string> = {
  normal: "一般",
  important: "重要",
  severe: "严重"
};

export const typeText: Record<SiteItemType, string> = {
  defect: "缺陷",
  punch: "尾工"
};

export function byId<T extends { id: string }>(items: T[], id?: string): T | undefined {
  return items.find((item) => item.id === id);
}

export function getSection(id?: string) {
  return byId(sections, id);
}

export function getArea(id?: string): Area | undefined {
  return byId(areas, id);
}

export function getDiscipline(id?: string) {
  return byId(disciplines, id);
}

export function getOrganization(id?: string): Organization | undefined {
  return byId(organizations, id);
}

export function getUser(id?: string): User | undefined {
  return byId(users, id);
}

export function isOverdue(item: SiteItem): boolean {
  return !["closed", "voided"].includes(item.status) && new Date(item.dueAt).getTime() < Date.now();
}

export function isDueSoon(item: SiteItem): boolean {
  const due = new Date(item.dueAt).getTime();
  const diff = due - Date.now();
  return !isOverdue(item) && diff >= 0 && diff <= dayMs;
}

export function canSeeItem(user: User, item: SiteItem): boolean {
  if (user.role === "admin") return true;
  if (!user.sectionScopeIds.includes(item.sectionId)) return false;
  if (item.createdBy === user.id) return true;
  if (item.ownerUserId === user.id) return true;
  if (user.role === "supervisor") return true;
  if (user.role === "contractor_manager") return item.responsibleOrgId === user.organizationId;
  return item.responsibleUserId === user.id;
}

export function visibleItems(user: User, items: SiteItem[]) {
  return items.filter((item) => canSeeItem(user, item));
}

export function defaultListItems(user: User, items: SiteItem[]) {
  const scopedItems = visibleItems(user, items);
  if (user.role !== "contractor_manager") return scopedItems;
  return scopedItems.filter(
    (item) =>
      item.responsibleOrgId === user.organizationId ||
      item.createdBy === user.id ||
      item.ownerUserId === user.id
  );
}

export function itemPhotos(itemId: string, source: PhotoAttachment[] = photos) {
  return source.filter((photo) => photo.siteItemId === itemId);
}

export function itemLogs(itemId: string, source: WorkflowLog[] = workflowLogs) {
  return source.filter((log) => log.siteItemId === itemId);
}

export function allowedActions(user: User, item: SiteItem): WorkflowAction[] {
  const actions = new Set<WorkflowAction>(["comment"]);
  const isOwner = item.ownerUserId === user.id;
  const isAdmin = user.role === "admin";

  if (isAdmin || isOwner) {
    if (item.status === "pending_approval") {
      actions.add("dispatch");
      actions.add("void");
    }
    if (item.status === "dispatched" || item.status === "rectifying") actions.add("void");
    if (item.status === "pending_acceptance") {
      actions.add("close");
      actions.add("return_rectification");
    }
    if (item.status === "closed" || item.status === "voided") actions.add("reopen");
  }

  if (user.role === "contractor_manager") {
    if (item.status === "dispatched" && item.responsibleOrgId === user.organizationId && !item.responsibleUserId) {
      actions.add("assign_rectifier");
    }
  }

  if (user.role === "rectifier" && item.responsibleUserId === user.id) {
    if (item.status === "dispatched") actions.add("start_rectify");
    if (item.status === "rectifying") actions.add("submit_review");
  }

  return Array.from(actions);
}

export function activeRectifiersForOrg(organizationId: string, sectionId?: string) {
  return users.filter(
    (user) =>
      user.role === "rectifier" &&
      user.organizationId === organizationId &&
      user.isActive &&
      (!sectionId || user.sectionScopeIds.includes(sectionId))
  );
}

export function summarize(items: SiteItem[]): DashboardSummary {
  return {
    total: items.length,
    open: items.filter((item) => !["closed", "voided"].includes(item.status)).length,
    pendingReview: items.filter((item) => item.status === "pending_acceptance").length,
    overdue: items.filter(isOverdue).length,
    closed: items.filter((item) => item.status === "closed").length
  };
}

export function countBy<T extends string>(items: SiteItem[], getKey: (item: SiteItem) => T | undefined): Record<T, number> {
  return items.reduce<Record<T, number>>((acc, item) => {
    const key = getKey(item);
    if (key) acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export function createLog(item: SiteItem, action: WorkflowAction, actorId: string, comment: string, toStatus?: SiteItemStatus): WorkflowLog {
  return {
    id: `log-${Date.now()}-${action}`,
    siteItemId: item.id,
    action,
    fromStatus: item.status,
    toStatus,
    comment,
    actorId,
    createdAt: new Date().toISOString()
  };
}

export function nextStatusForAction(action: WorkflowAction, item: SiteItem): SiteItemStatus {
  if (action === "dispatch") return "dispatched";
  if (action === "assign_rectifier") return "dispatched";
  if (action === "start_rectify") return "rectifying";
  if (action === "submit_review") return "pending_acceptance";
  if (action === "return_rectification") return "rectifying";
  if (action === "close") return "closed";
  if (action === "void") return "voided";
  if (action === "reopen") {
    if (item.responsibleUserId) return "rectifying";
    if (item.responsibleOrgId) return "dispatched";
    return "pending_approval";
  }
  return item.status;
}

export function idempotencyGuard(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
