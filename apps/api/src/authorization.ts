import type { SiteItem, Store, User, WorkflowAction } from "./types.js";

export interface RequestContext {
  user: User;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

export function requireAdmin(user: User): void {
  if (!isAdmin(user)) {
    throw new Error("FORBIDDEN");
  }
}

export function canAccessSection(user: User, sectionId: string): boolean {
  return isAdmin(user) || user.sectionScopeIds.includes(sectionId);
}

export function canAccessItem(user: User, item: SiteItem): boolean {
  if (!canAccessSection(user, item.sectionId)) return false;
  if (user.role === "admin" || user.role === "supervisor") return true;
  if (user.role === "contractor_manager") return item.responsibleOrgId === user.organizationId;
  return item.responsibleUserId === user.id;
}

export function canWorkflowOwner(user: User, item: SiteItem): boolean {
  if (!canAccessSection(user, item.sectionId)) return false;
  return user.role === "admin" || user.role === "supervisor" || item.ownerUserId === user.id || item.createdBy === user.id;
}

export function canAssignRectifier(user: User, item: SiteItem): boolean {
  if (!canAccessSection(user, item.sectionId)) return false;
  if (user.role === "admin" || user.role === "supervisor") return true;
  return user.role === "contractor_manager" && item.responsibleOrgId === user.organizationId;
}

export function visibleItems(user: User, store: Store): SiteItem[] {
  return store.siteItems.filter((item) => canAccessItem(user, item));
}

export function activeScopedSections(user: User, store: Store) {
  return store.sections.filter((section) => section.isActive && canAccessSection(user, section.id));
}

export function allowedWorkflowActions(user: User, item: SiteItem): WorkflowAction[] {
  const actions: WorkflowAction[] = ["comment"];
  if (canWorkflowOwner(user, item) && item.status === "pending_approval") actions.push("dispatch");
  if (canAssignRectifier(user, item) && item.status !== "closed" && item.status !== "voided") actions.push("assign_rectifier");
  if (item.responsibleUserId === user.id && item.status === "dispatched") actions.push("start_rectify");
  if (item.responsibleUserId === user.id && item.status === "rectifying") actions.push("submit_review");
  if (canWorkflowOwner(user, item) && item.status === "pending_acceptance") actions.push("close");
  if (canWorkflowOwner(user, item) && item.status !== "closed") actions.push("void");
  if (canWorkflowOwner(user, item) && (item.status === "closed" || item.status === "voided")) actions.push("reopen");
  return actions;
}
