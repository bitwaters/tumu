import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClient, ApiError } from "./api/client";
import { DrawingsApi, type DrawingWithCurrentRevision } from "./api/drawings";
import { readFrontendConfig, type FrontendRuntimeConfig } from "./api/env";
import { AuditApi, type AuditLogQuery } from "./api/audit";
import { AuthApi } from "./api/auth";
import { IdempotencyKeyStore } from "./api/idempotency";
import { MasterDataApi, type MasterDataKind, type MasterDataPayload, type MasterDataRecord, type MasterDataWriteInput } from "./api/masterData";
import { NotificationsApi } from "./api/notifications";
import { PhotosApi, type PhotoCompleteInput, type PhotoListQuery } from "./api/photos";
import { SiteItemsApi, flattenGroupedPhotos, type CreateSiteItemInput, type SiteItemDetailPayload, type SiteItemListQuery, type SiteItemWorkflowInput, type UpdateSiteItemInput } from "./api/siteItems";
import { clearStoredToken, readStoredToken, saveStoredToken } from "./api/session";
import { UsersApi } from "./api/users";
import {
  areas,
  auditLogs,
  disciplines,
  drawings,
  exportJobs,
  notifications as initialNotifications,
  organizations,
  photos as initialPhotos,
  sections,
  siteItems,
  users,
  workflowLogs as initialWorkflowLogs
} from "./mockData";
import {
  activeRectifiersForOrg,
  allowedActions,
  canSeeItem,
  countBy,
  createLog,
  defaultListItems,
  formatDate,
  getArea,
  getDiscipline,
  getOrganization,
  getSection,
  getUser,
  idempotencyGuard,
  isDueSoon,
  isOverdue,
  itemLogs,
  itemPhotos,
  nextStatusForAction,
  severityText,
  statusText,
  summarize,
  typeText,
  visibleItems
} from "./model";
import type {
  Area,
  AuditLog,
  Discipline,
  DrawingRevision,
  DrawingRevisionPage,
  DraftItem,
  Notification,
  Organization,
  PhotoAttachment,
  PhotoStage,
  Section,
  SiteItem,
  SiteItemStatus,
  UploadQueueItem,
  User,
  WorkflowAction,
  WorkflowLog
} from "./types";
import { Button, Card, EmptyState, Field, IconButton, MetricCard, PageHeader, Select, SeverityTag, StatusTag, TextArea, TextInput, TimingTag } from "./ui";

type RoleScopedTab<T extends string> = { id: T; label: string; roles?: Array<User["role"]> };
type MobileRoute = "todo" | "items" | "photo" | "dashboard" | "profile";
type DesktopRoute = "dashboard" | "todo" | "items" | "photo" | "drawings" | "master" | "users" | "exports" | "audit" | "profile";
type CreateItemOptions = { requestKey: string; selectedPhotoIds?: string[] };
type WorkflowOptions = SiteItemWorkflowInput & { userId?: string; organizationId?: string };
type FilterSelectOption = { value: string; label: string };
type AuthStatus = "checking" | "anonymous" | "authenticated";
type LoadState = "idle" | "loading" | "error";
type DirectoryData = MasterDataPayload & { users: User[] };
type ItemFilterValues = {
  status: string;
  type: string;
  severity: string;
  sectionId: string;
  areaId: string;
  disciplineId: string;
  organizationId: string;
  timing: string;
};

const initialDirectory: DirectoryData = {
  sections,
  organizations,
  areas,
  disciplines,
  users
};

const emptyDirectory: DirectoryData = {
  sections: [],
  organizations: [],
  areas: [],
  disciplines: [],
  users: []
};

const mobileTabs: Array<RoleScopedTab<MobileRoute> & { icon: string }> = [
  { id: "todo", label: "待办", icon: "□" },
  { id: "items", label: "事项", icon: "≡" },
  { id: "photo", label: "拍照", icon: "+" },
  { id: "dashboard", label: "看板", icon: "▦", roles: ["admin", "supervisor", "contractor_manager"] },
  { id: "profile", label: "我的", icon: "●" }
];

const desktopTabs: Array<RoleScopedTab<DesktopRoute>> = [
  { id: "dashboard", label: "首页看板" },
  { id: "todo", label: "待办处理" },
  { id: "items", label: "事项管理" },
  { id: "photo", label: "现场图库" },
  { id: "drawings", label: "图纸管理", roles: ["admin", "supervisor"] },
  { id: "master", label: "基础数据", roles: ["admin"] },
  { id: "users", label: "用户与权限", roles: ["admin"] },
  { id: "exports", label: "导入导出", roles: ["admin", "supervisor"] },
  { id: "audit", label: "审计日志", roles: ["admin"] },
  { id: "profile", label: "我的工作台" }
];

function uniqueId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDueAt() {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

function toDateTimeLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((candidate) => candidate.id === item.id);
  if (exists) return items.map((candidate) => (candidate.id === item.id ? item : candidate));
  return [item, ...items];
}

function siteItemListQuery(filters?: ItemFilterValues, search?: string): SiteItemListQuery {
  const query: SiteItemListQuery = {};
  const trimmedSearch = search?.trim();
  if (trimmedSearch) query.search = trimmedSearch;
  if (filters?.status && !["all", "open", "mine"].includes(filters.status)) query.status = filters.status as SiteItemStatus;
  if (filters?.type && filters.type !== "all") query.type = filters.type as SiteItem["type"];
  if (filters?.severity && filters.severity !== "all") query.severity = filters.severity as SiteItem["severity"];
  if (filters?.sectionId && filters.sectionId !== "all") query.sectionId = filters.sectionId;
  if (filters?.areaId && filters.areaId !== "all") query.areaId = filters.areaId;
  if (filters?.disciplineId && filters.disciplineId !== "all") query.disciplineId = filters.disciplineId;
  if (filters?.organizationId && filters.organizationId !== "all") query.organizationId = filters.organizationId;
  if (filters?.timing === "overdue") query.overdue = true;
  return query;
}

function scopedItems(state: AppState, user: User) {
  return state.runtimeConfig.useMocks ? visibleItems(user, state.items) : state.items;
}

function defaultScopedListItems(state: AppState, user: User) {
  return state.runtimeConfig.useMocks ? defaultListItems(user, state.items) : state.items;
}

function allowedItemActions(state: AppState, user: User, item: SiteItem): WorkflowAction[] {
  if (state.runtimeConfig.useMocks) return allowedActions(user, item);
  return state.allowedActionsByItem[item.id] ?? [];
}

function directoryItem<T extends { id: string }>(items: T[], id?: string): T | undefined {
  return items.find((item) => item.id === id);
}

function ownerCandidatesForDirectory(directory: DirectoryData, sectionId?: string) {
  const candidates = directory.users.filter(
    (user) =>
      user.isActive &&
      (user.role === "supervisor" || user.role === "admin") &&
      (!sectionId || user.sectionScopeIds.includes(sectionId))
  );
  return [
    ...candidates.filter((user) => user.role === "supervisor"),
    ...candidates.filter((user) => user.role === "admin")
  ];
}

function activeRectifiersForDirectory(directory: DirectoryData, organizationId: string, sectionId?: string) {
  return directory.users.filter(
    (user) =>
      user.role === "rectifier" &&
      user.organizationId === organizationId &&
      user.isActive &&
      (!sectionId || user.sectionScopeIds.includes(sectionId))
  );
}

function canEditSiteItem(user: User, item: SiteItem): boolean {
  if (item.status === "closed" || item.status === "voided") return false;
  if (user.role !== "admin" && !user.sectionScopeIds.includes(item.sectionId)) return false;
  return user.role === "admin" || user.role === "supervisor" || item.ownerUserId === user.id || item.createdBy === user.id;
}

function visibleDesktopTabs(user: User) {
  return desktopTabs.filter((tab) => !tab.roles || tab.roles.includes(user.role));
}

function visibleMobileTabs(user: User) {
  return mobileTabs.filter((tab) => !tab.roles || tab.roles.includes(user.role));
}

function canCreateItem(user?: User | null) {
  return user?.role === "admin" || user?.role === "supervisor";
}

function canExportItemData(user?: User | null) {
  return user?.role === "admin" || user?.role === "supervisor" || user?.role === "contractor_manager";
}

function ownerCandidatesForSection(sectionId?: string) {
  const candidates = users.filter(
    (user) =>
      user.isActive &&
      (user.role === "supervisor" || user.role === "admin") &&
      (!sectionId || user.sectionScopeIds.includes(sectionId))
  );
  return [
    ...candidates.filter((user) => user.role === "supervisor"),
    ...candidates.filter((user) => user.role === "admin")
  ];
}

function useAppState() {
  const runtimeConfig = useMemo(() => readFrontendConfig(), []);
  const apiClient = useMemo(
    () =>
      new ApiClient({
        baseUrl: runtimeConfig.apiBaseUrl,
        onUnauthorized: () => {
          setApiUser(null);
          setAuthStatus("anonymous");
        }
      }),
    [runtimeConfig.apiBaseUrl]
  );
  const auditApi = useMemo(() => new AuditApi(apiClient), [apiClient]);
  const authApi = useMemo(() => new AuthApi(apiClient), [apiClient]);
  const drawingsApi = useMemo(() => new DrawingsApi(apiClient), [apiClient]);
  const masterDataApi = useMemo(() => new MasterDataApi(apiClient), [apiClient]);
  const siteItemsApi = useMemo(() => new SiteItemsApi(apiClient), [apiClient]);
  const photosApi = useMemo(() => new PhotosApi(apiClient), [apiClient]);
  const notificationsApi = useMemo(() => new NotificationsApi(apiClient), [apiClient]);
  const usersApi = useMemo(() => new UsersApi(apiClient), [apiClient]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [apiUser, setApiUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (runtimeConfig.useMocks || !readStoredToken() ? "anonymous" : "checking"));
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [itemListState, setItemListState] = useState<LoadState>("idle");
  const [itemDetailState, setItemDetailState] = useState<LoadState>("idle");
  const [photoListState, setPhotoListState] = useState<LoadState>("idle");
  const [notificationState, setNotificationState] = useState<LoadState>("idle");
  const [auditLogState, setAuditLogState] = useState<LoadState>("idle");
  const [directoryState, setDirectoryState] = useState<LoadState>("idle");
  const [drawingListState, setDrawingListState] = useState<LoadState>("idle");
  const [items, setItems] = useState<SiteItem[]>(() => (runtimeConfig.useMocks ? siteItems : []));
  const [photos, setPhotos] = useState<PhotoAttachment[]>(() => (runtimeConfig.useMocks ? initialPhotos : []));
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoAttachment[]>(() => (runtimeConfig.useMocks ? initialPhotos : []));
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<WorkflowLog[]>(() => (runtimeConfig.useMocks ? initialWorkflowLogs : []));
  const [allowedActionsByItem, setAllowedActionsByItem] = useState<Record<string, WorkflowAction[]>>({});
  const [notifications, setNotifications] = useState<Notification[]>(() => (runtimeConfig.useMocks ? initialNotifications : []));
  const [auditLogRecords, setAuditLogRecords] = useState<AuditLog[]>(() => (runtimeConfig.useMocks ? auditLogs : []));
  const [drawingRecords, setDrawingRecords] = useState<DrawingWithCurrentRevision[]>(() =>
    runtimeConfig.useMocks ? drawings.map((drawing) => ({ ...drawing, currentRevision: drawing.revisions.find((revision) => revision.isCurrent) })) : []
  );
  const [drawingPagesByRevision, setDrawingPagesByRevision] = useState<Record<string, DrawingRevisionPage[]>>({});
  const [drawingPreviewUrls, setDrawingPreviewUrls] = useState<Record<string, string>>({});
  const [directory, setDirectory] = useState<DirectoryData>(() => (runtimeConfig.useMocks ? initialDirectory : emptyDirectory));
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeDraft, setActiveDraft] = useState<DraftItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [mobileRoute, setMobileRoute] = useState<MobileRoute>("todo");
  const [desktopRoute, setDesktopRoute] = useState<DesktopRoute>("dashboard");
  const [showNotifications, setShowNotifications] = useState(false);
  const idempotencyKeys = useRef(new Set<string>());
  const apiIdempotencyKeys = useRef(new IdempotencyKeyStore());

  const currentUser = runtimeConfig.useMocks ? (currentUserId ? users.find((user) => user.id === currentUserId) ?? null : null) : apiUser;

  const mergeItemDetail = useCallback((detail: SiteItemDetailPayload) => {
    const detailPhotos = flattenGroupedPhotos(detail.photos);
    setItems((prev) => upsertById(prev, detail));
    setPhotos((prev) => [...prev.filter((photo) => photo.siteItemId !== detail.id), ...detailPhotos]);
    setLogs((prev) => [...prev.filter((log) => log.siteItemId !== detail.id), ...detail.workflowLogs]);
    setAllowedActionsByItem((prev) => ({ ...prev, [detail.id]: detail.allowedActions }));
  }, []);

  const refreshSiteItems = useCallback(
    async (filters?: ItemFilterValues, search?: string) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      setItemListState("loading");
      try {
        const loadedItems = await siteItemsApi.list(siteItemListQuery(filters, search));
        setItems(loadedItems);
        setAllowedActionsByItem((prev) => ({
          ...prev,
          ...Object.fromEntries(
            loadedItems
              .filter((item) => item.allowedActions)
              .map((item) => [item.id, item.allowedActions ?? []])
          )
        }));
        setDataError(null);
        setItemListState("idle");
      } catch (error) {
        setDataError(errorMessage(error));
        setItemListState("error");
      }
    },
    [authStatus, runtimeConfig.useMocks, siteItemsApi]
  );

  const refreshItemDetail = useCallback(
    async (itemId: string) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      setItemDetailState("loading");
      try {
        const detail = await siteItemsApi.detail(itemId);
        mergeItemDetail(detail);
        setDataError(null);
        setItemDetailState("idle");
      } catch (error) {
        setDataError(errorMessage(error));
        setItemDetailState("error");
      }
    },
    [authStatus, mergeItemDetail, runtimeConfig.useMocks, siteItemsApi]
  );

  const refreshPhotos = useCallback(
    async (query: PhotoListQuery = {}) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      setPhotoListState("loading");
      try {
        const loadedPhotos = await photosApi.list(query);
        setGalleryPhotos(loadedPhotos);
        setDataError(null);
        setPhotoListState("idle");
      } catch (error) {
        setDataError(errorMessage(error));
        setPhotoListState("error");
      }
    },
    [authStatus, photosApi, runtimeConfig.useMocks]
  );

  const loadPhotoPreview = useCallback(
    async (photoId: string) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated" || photoPreviewUrls[photoId]) return;
      try {
        const preview = await photosApi.preview(photoId);
        setPhotoPreviewUrls((prev) => ({ ...prev, [photoId]: preview.previewUrl }));
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [authStatus, photoPreviewUrls, photosApi, runtimeConfig.useMocks]
  );

  const refreshNotifications = useCallback(async () => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
    setNotificationState("loading");
    try {
      const loadedNotifications = await notificationsApi.list();
      setNotifications(loadedNotifications);
      setDataError(null);
      setNotificationState("idle");
    } catch (error) {
      setDataError(errorMessage(error));
      setNotificationState("error");
    }
  }, [authStatus, notificationsApi, runtimeConfig.useMocks]);

  const refreshAuditLogs = useCallback(
    async (query: AuditLogQuery = {}) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      setAuditLogState("loading");
      try {
        const logs = await auditApi.list(query);
        setAuditLogRecords(logs);
        setDataError(null);
        setAuditLogState("idle");
      } catch (error) {
        setDataError(errorMessage(error));
        setAuditLogState("error");
      }
    },
    [auditApi, authStatus, runtimeConfig.useMocks]
  );

  const refreshDirectory = useCallback(async () => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
    setDirectoryState("loading");
    try {
      const [masterData, loadedUsers] = await Promise.all([
        masterDataApi.all(),
        usersApi.visible({ active: true })
      ]);
      setDirectory({ ...masterData, users: loadedUsers });
      setDataError(null);
      setDirectoryState("idle");
    } catch (error) {
      setDataError(errorMessage(error));
      setDirectoryState("error");
    }
  }, [authStatus, masterDataApi, runtimeConfig.useMocks, usersApi]);

  async function createMasterData(kind: MasterDataKind, input: MasterDataWriteInput): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      try {
        await masterDataApi.create(kind, input);
        await refreshDirectory();
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    const projectId = "project-power-001";
    const base = {
      id: `${kind}-${Date.now()}`,
      projectId,
      name: input.name || "未命名",
      code: input.code || `NEW-${Date.now()}`,
      isActive: input.isActive ?? true
    };
    setDirectory((prev) => {
      if (kind === "organizations") {
        return { ...prev, organizations: [{ ...base, type: input.type || "contractor" }, ...prev.organizations] };
      }
      if (kind === "areas") {
        return { ...prev, areas: [{ ...base, parentId: input.parentId || undefined }, ...prev.areas] };
      }
      if (kind === "disciplines") {
        return { ...prev, disciplines: [base, ...prev.disciplines] };
      }
      return { ...prev, sections: [base, ...prev.sections] };
    });
    setDataError(null);
    return true;
  }

  async function updateMasterData(kind: MasterDataKind, record: MasterDataRecord, input: MasterDataWriteInput): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      try {
        await masterDataApi.update(kind, record.id, input);
        await refreshDirectory();
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    setDirectory((prev) => {
      if (kind === "organizations") {
        return {
          ...prev,
          organizations: prev.organizations.map((item) => (item.id === record.id ? { ...item, ...input, type: input.type || item.type } : item))
        };
      }
      if (kind === "areas") {
        return {
          ...prev,
          areas: prev.areas.map((item) => (item.id === record.id ? { ...item, ...input, parentId: input.parentId || undefined } : item))
        };
      }
      if (kind === "disciplines") {
        return { ...prev, disciplines: prev.disciplines.map((item) => (item.id === record.id ? { ...item, ...input } : item)) };
      }
      return { ...prev, sections: prev.sections.map((item) => (item.id === record.id ? { ...item, ...input } : item)) };
    });
    setDataError(null);
    return true;
  }

  const refreshDrawings = useCallback(async () => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
    setDrawingListState("loading");
    try {
      const loadedDrawings = await drawingsApi.list();
      setDrawingRecords(loadedDrawings);
      setDataError(null);
      setDrawingListState("idle");
    } catch (error) {
      setDataError(errorMessage(error));
      setDrawingListState("error");
    }
  }, [authStatus, drawingsApi, runtimeConfig.useMocks]);

  const refreshDrawingRevisions = useCallback(
    async (drawingId: string) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      try {
        const revisions = await drawingsApi.revisions(drawingId);
        setDrawingRecords((prev) =>
          prev.map((drawing) =>
            drawing.id === drawingId
              ? {
                  ...drawing,
                  revisions,
                  currentRevision: revisions.find((revision) => revision.isCurrent)
                }
              : drawing
          )
        );
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [authStatus, drawingsApi, runtimeConfig.useMocks]
  );

  const refreshDrawingPages = useCallback(
    async (revisionId: string) => {
      if (runtimeConfig.useMocks) return;
      if (authStatus !== "authenticated" || drawingPagesByRevision[revisionId]) return;
      try {
        const pages = await drawingsApi.pages(revisionId);
        setDrawingPagesByRevision((prev) => ({ ...prev, [revisionId]: pages }));
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [authStatus, drawingPagesByRevision, drawingsApi, runtimeConfig.useMocks]
  );

  const loadDrawingPreview = useCallback(
    async (revisionId: string) => {
      if (runtimeConfig.useMocks || authStatus !== "authenticated" || drawingPreviewUrls[revisionId]) return;
      try {
        const preview = await drawingsApi.preview(revisionId);
        setDrawingPreviewUrls((prev) => ({ ...prev, [revisionId]: preview.previewUrl }));
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [authStatus, drawingPreviewUrls, drawingsApi, runtimeConfig.useMocks]
  );

  async function setCurrentDrawingRevision(revision: DrawingRevision) {
    if (runtimeConfig.useMocks) {
      setDrawingRecords((prev) =>
        prev.map((drawing) =>
          drawing.id === revision.drawingId
            ? {
                ...drawing,
                revisions: drawing.revisions.map((candidate) => ({ ...candidate, isCurrent: candidate.id === revision.id })),
                currentRevision: { ...revision, isCurrent: true }
              }
            : drawing
        )
      );
      return;
    }
    if (!currentUser || currentUser.role !== "admin") return;
    try {
      const updated = await drawingsApi.setCurrentRevision(revision.id);
      setDataError(null);
      await refreshDrawingRevisions(updated.drawingId);
    } catch (error) {
      setDataError(errorMessage(error));
    }
  }

  const selectItem = useCallback(
    (itemId: string | null) => {
      setSelectedItemId(itemId);
      if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
      if (itemId) {
        void refreshItemDetail(itemId);
      } else {
        void refreshSiteItems();
      }
    },
    [authStatus, refreshItemDetail, refreshSiteItems, runtimeConfig.useMocks]
  );

  useEffect(() => {
    if (runtimeConfig.useMocks) return;
    let cancelled = false;
    const token = readStoredToken();
    if (!token) {
      setAuthStatus("anonymous");
      return;
    }
    setAuthStatus("checking");
    authApi
      .currentUser()
      .then(({ user }) => {
        if (cancelled) return;
        setApiUser(user);
        setAuthStatus("authenticated");
        setAuthError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clearStoredToken();
        setApiUser(null);
        setAuthStatus("anonymous");
        setAuthError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [authApi, runtimeConfig.useMocks]);

  async function login(username: string, password: string): Promise<void> {
    if (runtimeConfig.useMocks) {
      setCurrentUserId(username);
      return;
    }
    setAuthStatus("checking");
    setAuthError(null);
    try {
      const result = await authApi.login(username, password);
      saveStoredToken(result.accessToken);
      setApiUser(result.user);
      setAuthStatus("authenticated");
      void refreshSiteItems();
    } catch (error) {
      clearStoredToken();
      setApiUser(null);
      setAuthStatus("anonymous");
      setAuthError(errorMessage(error));
    }
  }

  async function logout(): Promise<void> {
    if (runtimeConfig.useMocks) {
      setCurrentUserId(null);
      return;
    }
    try {
      if (readStoredToken()) await authApi.logout();
    } catch {
      // Local logout must still succeed if the backend is unavailable.
    } finally {
      clearStoredToken();
      setApiUser(null);
      setAuthStatus("anonymous");
      setAuthError(null);
      setItems([]);
      setPhotos([]);
      setPhotoPreviewUrls({});
      setLogs([]);
      setAllowedActionsByItem({});
      setNotifications([]);
      setAuditLogRecords([]);
      setDrawingRecords([]);
      setDrawingPagesByRevision({});
      setDrawingPreviewUrls({});
      setDirectory(emptyDirectory);
      setGalleryPhotos([]);
    }
  }

  useEffect(() => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated" || !currentUser) return;
    void refreshSiteItems();
    void refreshPhotos();
    void refreshNotifications();
    void refreshDirectory();
    void refreshDrawings();
  }, [authStatus, currentUser?.id, refreshDirectory, refreshDrawings, refreshNotifications, refreshPhotos, refreshSiteItems, runtimeConfig.useMocks]);

  function runOnce(key: string, action: () => void) {
    if (idempotencyGuard(idempotencyKeys.current, key)) action();
  }

  async function createItemFromForm(values: Partial<SiteItem>, options: CreateItemOptions) {
    if (!currentUser || !canCreateItem(currentUser)) return;
    if (!runtimeConfig.useMocks) {
      const input: CreateSiteItemInput = {
        sectionId: values.sectionId || currentUser.sectionScopeIds[0],
        type: values.type,
        severity: values.severity,
        title: values.title,
        description: values.description,
        areaId: values.areaId,
        disciplineId: values.disciplineId,
        locationText: values.locationText,
        dueAt: values.dueAt,
        photoIds: options.selectedPhotoIds ?? []
      };
      const key = apiIdempotencyKeys.current.get(options.requestKey, "create");
      try {
        const detail = await siteItemsApi.create(input, key);
        apiIdempotencyKeys.current.clear(options.requestKey);
        mergeItemDetail(detail);
        setDataError(null);
        setSelectedItemId(detail.id);
        setActiveDraft(null);
        setIsCreatingItem(false);
        setMobileRoute("items");
        void refreshSiteItems();
      } catch (error) {
        setDataError(errorMessage(error));
      }
      return;
    }
    runOnce(options.requestKey, () => {
      const dueAt = values.dueAt || defaultDueAt();
      const sectionId = values.sectionId || currentUser.sectionScopeIds[0] || sections[0].id;
      const ownerCandidates = ownerCandidatesForSection(sectionId);
      const defaultOwnerId =
        ["admin", "supervisor"].includes(currentUser.role) && currentUser.sectionScopeIds.includes(sectionId)
          ? currentUser.id
          : ownerCandidates[0]?.id || currentUser.id;
      const newItem: SiteItem = {
        id: `item-${Date.now()}`,
        projectId: "project-power-001",
        sectionId,
        itemNo: `ITEM-2026-${String(items.length + 1).padStart(4, "0")}`,
        type: values.type || "defect",
        status: "pending_approval",
        severity: values.severity || "normal",
        title: values.title || "未命名事项",
        description: values.description || "",
        areaId: values.areaId || areas[0].id,
        disciplineId: values.disciplineId || disciplines[0].id,
        locationText: values.locationText || "",
        createdBy: currentUser.id,
        ownerUserId: values.ownerUserId || defaultOwnerId,
        defaultDueAt: dueAt,
        dueAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setItems((prev) => [newItem, ...prev]);
      bindPhotosToItem(newItem, options.selectedPhotoIds || [], "discovery");
      setLogs((prev) => [createLog(newItem, "create", currentUser.id, "前端 mock 提交待审核事项", "pending_approval"), ...prev]);
      selectItem(newItem.id);
      setActiveDraft(null);
      setIsCreatingItem(false);
      setMobileRoute("items");
    });
  }

  async function updateItem(item: SiteItem, values: UpdateSiteItemInput, requestKey: string): Promise<boolean> {
    if (!currentUser || !canEditSiteItem(currentUser, item)) return false;
    const input: UpdateSiteItemInput = {
      type: values.type,
      severity: values.severity,
      title: values.title,
      description: values.description,
      sectionId: values.sectionId,
      areaId: values.areaId,
      disciplineId: values.disciplineId,
      locationText: values.locationText,
      dueAt: values.dueAt
    };
    if (!runtimeConfig.useMocks) {
      const actionId = `update:${item.id}:${item.updatedAt}:${JSON.stringify(input)}`;
      const key = apiIdempotencyKeys.current.get(actionId, "update");
      try {
        const detail = await siteItemsApi.update(item.id, input, key);
        apiIdempotencyKeys.current.clear(actionId);
        mergeItemDetail(detail);
        setDataError(null);
        void refreshSiteItems();
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        void refreshItemDetail(item.id);
        return false;
      }
    }
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              ...input,
              updatedAt: new Date().toISOString()
            }
          : candidate
      )
    );
    setDataError(null);
    return true;
  }

  function openCreateItem() {
    if (!currentUser || !canCreateItem(currentUser)) return;
    setSelectedItemId(null);
    setActiveDraft(null);
    setIsCreatingItem(true);
    setMobileRoute("items");
  }

  function openDraft(draft: DraftItem) {
    if (!currentUser || !canCreateItem(currentUser) || draft.createdBy !== currentUser.id) return;
    setSelectedItemId(null);
    setActiveDraft(draft);
    setIsCreatingItem(true);
    setMobileRoute("items");
  }

  function saveDraft(values: Partial<SiteItem>, selectedPhotoIds: string[] = []) {
    if (!currentUser || !canCreateItem(currentUser)) return;
    setDrafts((prev) => [
      {
        id: `draft-${Date.now()}`,
        title: values.title || "未命名草稿",
        savedAt: new Date().toISOString(),
        createdBy: currentUser.id,
        values,
        selectedPhotoIds
      },
      ...prev
    ]);
  }

  async function applyWorkflow(item: SiteItem, action: WorkflowAction, options?: WorkflowOptions) {
    if (!currentUser) return;
    if (!runtimeConfig.useMocks) {
      const input: SiteItemWorkflowInput = {
        responsibleOrgId: options?.responsibleOrgId ?? options?.organizationId,
        responsibleUserId: options?.responsibleUserId ?? options?.userId,
        photoIds: options?.photoIds,
        comment: options?.comment
      };
      const actionId = [
        "workflow",
        action,
        item.id,
        item.status,
        item.updatedAt,
        input.responsibleOrgId,
        input.responsibleUserId,
        input.photoIds?.join(","),
        input.comment
      ]
        .filter(Boolean)
        .join(":");
      const key = apiIdempotencyKeys.current.get(actionId, action === "comment" ? "comment" : "workflow");
      try {
        const detail = await siteItemsApi.workflow(item.id, action, input, key);
        apiIdempotencyKeys.current.clear(actionId);
        mergeItemDetail(detail);
        setDataError(null);
        void refreshSiteItems();
      } catch (error) {
        setDataError(errorMessage(error));
        void refreshItemDetail(item.id);
      }
      return;
    }
    const latestItem = items.find((candidate) => candidate.id === item.id);
    if (!latestItem || !canSeeItem(currentUser, latestItem)) return;
    if (!allowedActions(currentUser, latestItem).includes(action)) return;
    if (action === "dispatch") {
      const targetOrg = organizations.find((organization) => organization.id === options?.organizationId);
      if (!targetOrg || targetOrg.type !== "contractor" || !targetOrg.isActive) return;
    }
    if (action === "assign_rectifier") {
      const canAssignUser = activeRectifiersForOrg(latestItem.responsibleOrgId || "", latestItem.sectionId).some((user) => user.id === options?.userId);
      if (!canAssignUser) return;
    }
    runOnce(`${action}-${latestItem.id}-${latestItem.status}-${latestItem.updatedAt}-${options?.userId ?? ""}-${options?.organizationId ?? ""}`, () => {
      const nextStatus = nextStatusForAction(action, latestItem);
      setItems((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== latestItem.id) return candidate;
          return {
            ...candidate,
            status: nextStatus,
            responsibleOrgId: action === "dispatch" ? options?.organizationId : candidate.responsibleOrgId,
            responsibleUserId: action === "assign_rectifier" ? options?.userId : candidate.responsibleUserId,
            submittedForReviewAt:
              action === "submit_review"
                ? new Date().toISOString()
                : action === "return_rectification" || action === "reopen"
                  ? undefined
                  : candidate.submittedForReviewAt,
            closedAt: action === "close" ? new Date().toISOString() : action === "reopen" ? undefined : candidate.closedAt,
            voidedAt: action === "void" ? new Date().toISOString() : action === "reopen" ? undefined : candidate.voidedAt,
            reopenedAt: action === "reopen" ? new Date().toISOString() : candidate.reopenedAt,
            updatedAt: new Date().toISOString()
          };
        })
      );
      setLogs((prev) => [createLog(latestItem, action, currentUser.id, options?.comment || actionLabel(action), nextStatus), ...prev]);
      if (action === "submit_review") {
        setNotifications((prev) => [
          {
            id: `nt-${Date.now()}`,
            recipientId: latestItem.ownerUserId,
            siteItemId: latestItem.id,
            type: "review_requested",
            title: "新的待复验事项",
            content: latestItem.title,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      }
    });
  }

  function bindPhotoToItem(photo: PhotoAttachment, item: SiteItem, stage: PhotoStage): PhotoAttachment {
    return {
      ...photo,
      siteItemId: item.id,
      stage,
      sectionSnapshot: getSection(item.sectionId)?.name || "-",
      areaSnapshot: getArea(item.areaId)?.name || "-",
      disciplineSnapshot: getDiscipline(item.disciplineId)?.name || "-",
      responsibleOrgSnapshot: getOrganization(item.responsibleOrgId)?.name || "待责任工程师派发"
    };
  }

  function bindPhotosToItem(item: SiteItem, photoIds: string[], stage: PhotoStage) {
    if (!currentUser || !photoIds.length || !canSeeItem(currentUser, item)) return;
    const selected = new Set(photoIds);
    setPhotos((prev) =>
      prev.map((photo) =>
        selected.has(photo.id) && !photo.siteItemId && photo.uploadedBy === currentUser.id
          ? bindPhotoToItem(photo, item, stage)
          : photo
      )
    );
    setGalleryPhotos((prev) =>
      prev.map((photo) =>
        selected.has(photo.id) && !photo.siteItemId && photo.uploadedBy === currentUser.id
          ? bindPhotoToItem(photo, item, stage)
          : photo
      )
    );
  }

  function buildPhoto(upload: UploadQueueItem, item?: SiteItem): PhotoAttachment {
    const base = {
      id: `photo-${Date.now()}`,
      thumbnailKey: upload.fileName,
      fileName: upload.fileName,
      uploadedBy: currentUser?.id || "",
      uploadedAt: new Date().toISOString()
    };
    if (!item) return base;
    return {
      ...base,
      siteItemId: item.id,
      stage: upload.stage,
      sectionSnapshot: getSection(item.sectionId)?.name || "-",
      areaSnapshot: getArea(item.areaId)?.name || "-",
      disciplineSnapshot: getDiscipline(item.disciplineId)?.name || "-",
      responsibleOrgSnapshot: getOrganization(item.responsibleOrgId)?.name || "待责任工程师派发"
    };
  }

  function addMockUpload(stage: PhotoStage = "discovery") {
    if (!currentUser) return;
    if (!runtimeConfig.useMocks) {
      setDataError("请通过添加照片选择本地图片上传。");
      return;
    }
    const newUpload: UploadQueueItem = {
      id: `upload-${Date.now()}`,
      fileName: `现场照片-${uploadQueue.length + 1}.jpg`,
      stage,
      state: "pending",
      uploadedBy: currentUser.id
    };
    setUploadQueue((prev) => [newUpload, ...prev]);
  }

  async function uploadPhotoFiles(fileList: FileList | File[], stage: PhotoStage = "discovery") {
    if (!currentUser) return;
    const files = Array.from(fileList);
    if (runtimeConfig.useMocks) {
      files.forEach(() => addMockUpload(stage));
      return;
    }
    const uploads = files.map((file) => ({
      id: uniqueId("upload"),
      fileName: file.name || "现场照片.jpg",
      stage,
      state: "pending" as const,
      uploadedBy: currentUser.id,
      file,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      completeRequestKey: uniqueId("photo-complete")
    }));
    setUploadQueue((prev) => [...uploads, ...prev]);
    for (const upload of uploads) {
      void completeUpload(upload);
    }
  }

  async function uploadObjectAndComplete(upload: UploadQueueItem): Promise<PhotoAttachment> {
    if (!upload.file && !upload.objectKey) throw new Error("缺少可上传的照片文件");
    const mimeType = upload.mimeType || upload.file?.type || "image/jpeg";
    const sizeBytes = upload.sizeBytes ?? upload.file?.size ?? 0;
    let objectKey = upload.objectKey;
    if (!objectKey) {
      if (!upload.file) throw new Error("缺少可上传的照片文件");
      const presign = await photosApi.presign({ fileName: upload.fileName, mimeType, sizeBytes });
      objectKey = presign.objectKey;
      setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, objectKey } : item)));
      const response = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: upload.file,
        headers: { "Content-Type": mimeType }
      });
      if (!response.ok) throw new Error("对象存储上传失败");
    }
    const completeInput: PhotoCompleteInput = { objectKey, fileName: upload.fileName, mimeType, sizeBytes };
    const key = apiIdempotencyKeys.current.get(upload.completeRequestKey || upload.id, "photo-complete");
    return photosApi.complete(completeInput, key);
  }

  async function completeUpload(upload: UploadQueueItem) {
    if (!currentUser) {
      setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "failed" } : item)));
      return;
    }
    if (!runtimeConfig.useMocks) {
      setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "uploading" } : item)));
      try {
        const photo = await uploadObjectAndComplete(upload);
        apiIdempotencyKeys.current.clear(upload.completeRequestKey || upload.id);
        setGalleryPhotos((prev) => [photo, ...prev.filter((candidate) => candidate.id !== photo.id)]);
        setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "complete" } : item)));
        setDataError(null);
        void refreshPhotos();
      } catch (error) {
        setDataError(errorMessage(error));
        setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "failed" } : item)));
      }
      return;
    }
    const item = upload.siteItemId ? items.find((candidate) => candidate.id === upload.siteItemId) : undefined;
    runOnce(`photo-complete-${upload.id}`, () => {
      const photo = buildPhoto(upload, item);
      setPhotos((prev) => [photo, ...prev]);
      setGalleryPhotos((prev) => [photo, ...prev]);
      setUploadQueue((prev) => prev.map((queueItem) => (queueItem.id === upload.id ? { ...queueItem, state: "complete" } : queueItem)));
    });
  }

  async function deletePhoto(photo: PhotoAttachment) {
    if (!currentUser) return;
    if (runtimeConfig.useMocks) {
      setPhotos((prev) => prev.filter((candidate) => candidate.id !== photo.id));
      setGalleryPhotos((prev) => prev.filter((candidate) => candidate.id !== photo.id));
      return;
    }
    const actionId = `delete-photo:${photo.id}`;
    const key = apiIdempotencyKeys.current.get(actionId, "delete");
    try {
      await photosApi.delete(photo.id, key);
      apiIdempotencyKeys.current.clear(actionId);
      setGalleryPhotos((prev) => prev.filter((candidate) => candidate.id !== photo.id));
      setDataError(null);
      void refreshPhotos();
    } catch (error) {
      setDataError(errorMessage(error));
    }
  }

  async function markNotificationRead(notification: Notification) {
    if (runtimeConfig.useMocks) {
      setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
      return;
    }
    try {
      const updated = await notificationsApi.markRead(notification.id);
      setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setDataError(null);
    } catch (error) {
      setDataError(errorMessage(error));
    }
  }

  async function markAllNotificationsRead() {
    if (runtimeConfig.useMocks) {
      setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      return;
    }
    try {
      await notificationsApi.markAllRead();
      await refreshNotifications();
      setDataError(null);
    } catch (error) {
      setDataError(errorMessage(error));
    }
  }

  return {
    currentUser,
    currentUserId,
    setCurrentUserId: (id: string | null) => {
      if (runtimeConfig.useMocks) {
        setCurrentUserId(id);
      } else if (id === null) {
        void logout();
      }
    },
    runtimeConfig,
    authStatus,
    authError,
    login,
    logout,
    items,
    setItems,
    photos,
    galleryPhotos,
    photoPreviewUrls,
    logs,
    notifications,
    setNotifications,
    auditLogRecords,
    drawingRecords,
    drawingPagesByRevision,
    drawingPreviewUrls,
    directory,
    drafts,
    setDrafts,
    activeDraft,
    setActiveDraft,
    uploadQueue,
    setUploadQueue,
    selectedItemId,
    setSelectedItemId: selectItem,
    refreshSiteItems,
    refreshItemDetail,
    refreshPhotos,
    loadPhotoPreview,
    refreshNotifications,
    refreshAuditLogs,
    refreshDirectory,
    createMasterData,
    updateMasterData,
    refreshDrawings,
    refreshDrawingRevisions,
    refreshDrawingPages,
    loadDrawingPreview,
    itemListState,
    itemDetailState,
    photoListState,
    notificationState,
    auditLogState,
    directoryState,
    drawingListState,
    dataError,
    allowedActionsByItem,
    isCreatingItem,
    setIsCreatingItem,
    mobileRoute,
    setMobileRoute,
    desktopRoute,
    setDesktopRoute,
    showNotifications,
    setShowNotifications,
    openCreateItem,
    openDraft,
    createItemFromForm,
    updateItem,
    saveDraft,
    applyWorkflow,
    bindPhotosToItem,
    addMockUpload,
    uploadPhotoFiles,
    completeUpload,
    deletePhoto,
    markNotificationRead,
    markAllNotificationsRead,
    setCurrentDrawingRevision
  };
}

export function App() {
  const state = useAppState();
  if (state.authStatus === "checking") return <AuthLoadingPage config={state.runtimeConfig} />;
  if (!state.currentUser) return <LoginPage state={state} />;
  return <Shell state={state} user={state.currentUser} />;
}

type AppState = ReturnType<typeof useAppState>;

function AuthLoadingPage({ config }: { config: FrontendRuntimeConfig }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <span className="product-mark">POWER SITE</span>
        <h1>正在恢复登录</h1>
        <p>{config.useMocks ? "正在进入原型模式。" : `正在连接 ${config.apiBaseUrl}`}</p>
      </section>
    </main>
  );
}

function LoginPage({ state }: { state: AppState }) {
  const [selected, setSelected] = useState(users[1].id);
  const [username, setUsername] = useState("wang.supervisor");
  const [password, setPassword] = useState("password123");
  const isMockMode = state.runtimeConfig.useMocks;
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <span className="product-mark">POWER SITE</span>
          <h1>发电站现场管理</h1>
          <p>{isMockMode ? "尾工与缺陷闭环、现场照片和整改看板的前端原型。" : "连接现场管理 API，进入真实数据工作台。"}</p>
        </div>
        {isMockMode ? (
          <>
            <Field label="账号">
              <TextInput value={getUser(selected)?.username || ""} readOnly />
            </Field>
            <Field label="密码">
              <TextInput value="mock-password" type="password" readOnly />
            </Field>
            <Field label="Mock 角色">
              <Select value={selected} onChange={(event) => setSelected(event.target.value)}>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {roleLabel(user.role)} - {user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => state.login(selected, "mock-password")}>登录原型</Button>
          </>
        ) : (
          <>
            <Field label="账号">
              <TextInput value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名或手机号" />
            </Field>
            <Field label="密码">
              <TextInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </Field>
            {state.authError ? <p className="form-error">{state.authError}</p> : null}
            <Button disabled={state.authStatus === "checking" || !username || !password} onClick={() => void state.login(username, password)}>
              登录
            </Button>
            <p className="muted">API：{state.runtimeConfig.apiBaseUrl}</p>
          </>
        )}
      </section>
    </main>
  );
}

function Shell({ state, user }: { state: AppState; user: User }) {
  const unreadCount = state.notifications.filter((notice) => notice.recipientId === user.id && !notice.readAt).length;
  const mobileNavTabs = visibleMobileTabs(user);
  const activeMobileRoute = mobileNavTabs.some((tab) => tab.id === state.mobileRoute) ? state.mobileRoute : "todo";
  const desktopNavTabs = visibleDesktopTabs(user);
  const activeDesktopRoute = desktopNavTabs.some((tab) => tab.id === state.desktopRoute) ? state.desktopRoute : "dashboard";
  return (
    <div className="app">
      <div className="mobile-shell">
        <header className="mobile-topbar">
          <div>
            <strong>现场闭环</strong>
            <span>{getOrganization(user.organizationId)?.name}</span>
          </div>
          <IconButton label="通知" onClick={() => state.setShowNotifications(true)}>
            {unreadCount ? <span className="badge">{unreadCount}</span> : null}!
          </IconButton>
        </header>
        <main className="mobile-content">{renderMobileRoute(state, user)}</main>
        <nav className="bottom-nav">
          {mobileNavTabs.map((tab) => (
            <button
              key={tab.id}
              className={activeMobileRoute === tab.id ? "active" : ""}
              onClick={() => {
                state.setSelectedItemId(null);
                state.setIsCreatingItem(false);
                state.setActiveDraft(null);
                state.setMobileRoute(tab.id);
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {tab.id === "profile" && unreadCount ? <i className="nav-dot" /> : null}
            </button>
          ))}
        </nav>
        {state.showNotifications ? <NotificationPanel state={state} user={user} /> : null}
      </div>

      <div className="desktop-shell">
        <aside className="sidebar">
          <span className="product-mark">POWER SITE</span>
          <h2>现场管理</h2>
          <div className="user-chip">
            <strong>{user.name}</strong>
            <span>{roleLabel(user.role)}</span>
          </div>
          <nav>
            {desktopNavTabs.map((tab) => (
              <button
                key={tab.id}
                className={activeDesktopRoute === tab.id ? "active" : ""}
                onClick={() => {
                  state.setSelectedItemId(null);
                  state.setIsCreatingItem(false);
                  state.setActiveDraft(null);
                  state.setDesktopRoute(tab.id);
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="desktop-content">{renderDesktopRoute(state, user)}</main>
      </div>
    </div>
  );
}

function renderMobileRoute(state: AppState, user: User) {
  if (state.isCreatingItem && canCreateItem(user)) {
    return (
      <CreateItemPage
        state={state}
        onBack={() => {
          state.setActiveDraft(null);
          state.setIsCreatingItem(false);
        }}
      />
    );
  }
  if (state.selectedItemId) {
    const selected = state.items.find((item) => item.id === state.selectedItemId);
    if (selected) return <ItemDetailPage state={state} user={user} item={selected} />;
  }
  const allowedRoutes = visibleMobileTabs(user).map((tab) => tab.id);
  const route = allowedRoutes.includes(state.mobileRoute) ? state.mobileRoute : "todo";
  if (route === "todo") return <TodoPage state={state} user={user} />;
  if (route === "items") return <ItemListPage state={state} user={user} />;
  if (route === "photo") return <PhotoPage state={state} />;
  if (route === "dashboard") return <MobileDashboard state={state} user={user} />;
  return <ProfilePage state={state} user={user} />;
}

function renderDesktopRoute(state: AppState, user: User) {
  if (state.isCreatingItem && canCreateItem(user)) {
    return (
      <CreateItemPage
        state={state}
        onBack={() => {
          state.setActiveDraft(null);
          state.setIsCreatingItem(false);
        }}
      />
    );
  }
  if (state.selectedItemId) {
    const selected = state.items.find((item) => item.id === state.selectedItemId);
    if (selected) return <ItemDetailPage state={state} user={user} item={selected} />;
  }
  const allowedRoutes = visibleDesktopTabs(user).map((tab) => tab.id);
  const route = allowedRoutes.includes(state.desktopRoute) ? state.desktopRoute : "dashboard";
  if (route === "dashboard") return <DesktopDashboard state={state} user={user} />;
  if (route === "todo") return <DesktopTodo state={state} user={user} />;
  if (route === "items") return <DesktopItems state={state} user={user} />;
  if (route === "photo") return <PhotoPage state={state} />;
  if (route === "drawings") return <DrawingAdmin state={state} user={user} />;
  if (route === "master") return <MasterDataPage state={state} />;
  if (route === "users") return <UsersPage state={state} />;
  if (route === "exports") return <ExportsPage />;
  if (route === "profile") return <ProfilePage state={state} user={user} />;
  return <AuditPage state={state} />;
}

function TodoPage({ state, user }: { state: AppState; user: User }) {
  const items = scopedItems(state, user);
  const todoItems = items.filter((item) => item.status !== "closed" && item.status !== "voided");
  const summary = summarize(items);
  return (
    <div className="stack">
      <PageHeader
        title="我的待办"
        meta="现场事项优先处理"
        action={canCreateItem(user) ? <Button onClick={state.openCreateItem}>新建</Button> : undefined}
      />
      <div className="metric-grid">
        <MetricCard label="待审核" value={todoItems.filter((item) => item.status === "pending_approval").length} tone="due" />
        <MetricCard label="待整改" value={todoItems.filter((item) => item.status === "rectifying" || item.status === "dispatched").length} />
        <MetricCard label="待复验" value={summary.pendingReview} tone="due" />
        <MetricCard label="超期" value={summary.overdue} tone="danger" />
      </div>
      <div className="action-row">
        {canCreateItem(user) ? <Button onClick={state.openCreateItem}>新建事项</Button> : null}
        <Button variant="secondary" onClick={() => state.setMobileRoute("photo")}>拍照上传</Button>
      </div>
      {todoItems.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          photoCount={itemPhotos(item.id, state.photos).length}
          onClick={() => state.setSelectedItemId(item.id)}
        />
      ))}
    </div>
  );
}

function ItemListPage({ state, user }: { state: AppState; user: User }) {
  const [filters, setFilters] = useState<ItemFilterValues>({
    status: "open",
    type: "all",
    severity: "all",
    sectionId: "all",
    areaId: "all",
    disciplineId: "all",
    organizationId: "all",
    timing: "all"
  });
  const [query, setQuery] = useState("");
  useEffect(() => {
    void state.refreshSiteItems(filters, query);
  }, [filters, query, state.refreshSiteItems]);
  const base = defaultScopedListItems(state, user);
  const filtered = base.filter((item) => {
    const text = [
      item.itemNo,
      item.title,
      getSection(item.sectionId)?.name,
      getArea(item.areaId)?.name,
      getDiscipline(item.disciplineId)?.name,
      getOrganization(item.responsibleOrgId)?.name
    ].join("");
    return matchesItemFilter(filters, item, user, state) && (state.runtimeConfig.useMocks ? text.includes(query) : true);
  });
  function updateFilter<K extends keyof ItemFilterValues>(key: K, value: ItemFilterValues[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }
  return (
    <div className="stack">
      <PageHeader title="事项" meta="缺陷与尾工统一管理" action={canCreateItem(user) ? <Button onClick={state.openCreateItem}>新建</Button> : undefined} />
      <div className="filter-bar">
        <TextInput placeholder="搜索标题、编号、区域、单位" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="open">进行中</option>
          <option value="mine">我的待办</option>
          <option value="pending_approval">待审核</option>
          <option value="dispatched">已派发</option>
          <option value="rectifying">整改中</option>
          <option value="pending_acceptance">待复验</option>
          <option value="closed">已关闭</option>
          <option value="voided">已作废</option>
        </Select>
        <Select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}>
          <option value="all">全部类型</option>
          <option value="defect">缺陷</option>
          <option value="punch">尾工</option>
        </Select>
      </div>
      {state.itemListState === "loading" ? <p className="muted">正在刷新事项列表...</p> : null}
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      {filtered.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          photoCount={itemPhotos(item.id, state.photos).length}
          onClick={() => state.setSelectedItemId(item.id)}
        />
      ))}
      {!filtered.length ? <EmptyState title="没有匹配事项" description="调整搜索或筛选后再试。" /> : null}
    </div>
  );
}

function matchesItemFilter(filters: ItemFilterValues, item: SiteItem, user: User, state?: AppState) {
  if (filters.status === "open" && ["closed", "voided"].includes(item.status)) return false;
  if (filters.status === "mine") {
    if (state && !state.runtimeConfig.useMocks) {
      const detailActions = state.allowedActionsByItem[item.id];
      if (detailActions) return detailActions.some((action) => action !== "comment");
      return false;
    }
    if (!allowedActions(user, item).some((action) => action !== "comment")) return false;
  }
  if (!["open", "mine"].includes(filters.status) && item.status !== filters.status) return false;
  if (filters.type !== "all" && item.type !== filters.type) return false;
  if (filters.severity !== "all" && item.severity !== filters.severity) return false;
  if (filters.sectionId !== "all" && item.sectionId !== filters.sectionId) return false;
  if (filters.areaId !== "all" && item.areaId !== filters.areaId) return false;
  if (filters.disciplineId !== "all" && item.disciplineId !== filters.disciplineId) return false;
  if (filters.organizationId !== "all" && item.responsibleOrgId !== filters.organizationId) return false;
  if (filters.timing === "dueSoon" && !isDueSoon(item)) return false;
  if (filters.timing === "overdue" && !isOverdue(item)) return false;
  return true;
}

function ItemCard({ item, photoCount, onClick }: { item: SiteItem; photoCount: number; onClick: () => void }) {
  return (
    <Card className="item-card">
      <button onClick={onClick} className="card-button">
        <div className="card-title-row">
          <StatusTag status={item.status} />
          <span className="tag-group">
            <TimingTag overdue={isOverdue(item)} dueSoon={isDueSoon(item)} />
            <SeverityTag severity={item.severity} />
          </span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.itemNo} · {typeText[item.type]}</p>
        <dl className="item-meta">
          <div><dt>位置</dt><dd>{getArea(item.areaId)?.name} / {getDiscipline(item.disciplineId)?.name}</dd></div>
          <div><dt>责任</dt><dd>{getOrganization(item.responsibleOrgId)?.name || "待责任工程师派发"}</dd></div>
          <div><dt>截止</dt><dd>{formatDate(item.dueAt)}</dd></div>
          <div><dt>照片</dt><dd>{photoCount} 张</dd></div>
        </dl>
      </button>
    </Card>
  );
}

function CreateItemPage({ state, onBack }: { state: AppState; onBack: () => void }) {
  const currentUser = state.currentUser;
  const draftValues = state.activeDraft?.values;
  const directory = state.directory;
  const scopedSections =
    currentUser?.role === "admin"
      ? directory.sections
      : directory.sections.filter((section) => currentUser?.sectionScopeIds.includes(section.id));
  const initialSectionId = draftValues?.sectionId || scopedSections[0]?.id || directory.sections[0]?.id;
  const initialOwnerCandidates = ownerCandidatesForDirectory(directory, initialSectionId);
  const defaultOwnerId =
    currentUser && ["admin", "supervisor"].includes(currentUser.role) && currentUser.sectionScopeIds.includes(initialSectionId)
      ? currentUser.id
      : initialOwnerCandidates[0]?.id;
  const [requestKey] = useState(() => uniqueId("create-request"));
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>(state.activeDraft?.selectedPhotoIds || []);
  const [isPickingPhotos, setIsPickingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoAttachment | null>(null);
  const [values, setValues] = useState<Partial<SiteItem>>({
    type: "defect",
    severity: "important",
    sectionId: initialSectionId,
    areaId: directory.areas[0]?.id,
    disciplineId: directory.disciplines[0]?.id,
    ownerUserId: defaultOwnerId,
    title: "",
    description: "",
    locationText: "",
    dueAt: defaultDueAt(),
    ...draftValues
  });
  const ownerCandidates = ownerCandidatesForDirectory(directory, values.sectionId);
  const availablePhotos = state.galleryPhotos
    .filter((photo) => !photo.siteItemId && photo.uploadedBy === currentUser?.id)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const selectedPhotos = availablePhotos.filter((photo) => selectedPhotoIds.includes(photo.id));
  const canSubmit = Boolean(values.sectionId && values.areaId && values.disciplineId && (values.title || "").trim());
  function changeArea(areaId: string) {
    setValues({ ...values, areaId });
  }
  function togglePhoto(photoId: string) {
    setSelectedPhotoIds((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
  }
  useEffect(() => {
    if (isPickingPhotos) void state.refreshPhotos({ unboundOnly: true });
  }, [isPickingPhotos, state.refreshPhotos]);
  if (isPickingPhotos) {
    return (
      <PhotoPickerPage
        state={state}
        title="选择发现照片"
        photos={availablePhotos}
        selectedPhotoIds={selectedPhotoIds}
        onToggle={togglePhoto}
        onCancel={() => setIsPickingPhotos(false)}
        onConfirm={() => setIsPickingPhotos(false)}
      />
    );
  }
  return (
    <div className="stack">
      <PageHeader title="新建事项" meta="缺陷和尾工共用表单" action={<Button variant="ghost" onClick={onBack}>返回</Button>} />
      <Card>
        <div className="form-grid">
          <Field label="事项类型">
            <Select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as SiteItem["type"] })}>
              <option value="defect">缺陷</option>
              <option value="punch">尾工</option>
            </Select>
          </Field>
          <Field label="严重等级">
            <Select value={values.severity} onChange={(event) => setValues({ ...values, severity: event.target.value as SiteItem["severity"] })}>
              <option value="normal">一般</option>
              <option value="important">重要</option>
              <option value="severe">严重</option>
            </Select>
          </Field>
          <Field label="标题">
            <TextInput value={values.title || ""} onChange={(event) => setValues({ ...values, title: event.target.value })} placeholder="例如：主厂房柱脚蜂窝需修补" />
          </Field>
          <Field label="描述">
            <TextArea value={values.description || ""} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="描述现场情况、整改要求或复验关注点" />
          </Field>
          <Field label="标段">
            <Select
              value={values.sectionId}
              onChange={(event) => {
                const sectionId = event.target.value;
                const candidates = ownerCandidatesForDirectory(directory, sectionId);
                const ownerStillValid = candidates.some((candidate) => candidate.id === values.ownerUserId);
                setValues({ ...values, sectionId, ownerUserId: ownerStillValid ? values.ownerUserId : candidates[0]?.id });
              }}
            >
              {scopedSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </Select>
          </Field>
          <Field label="区域">
            <Select value={values.areaId} onChange={(event) => changeArea(event.target.value)}>
              {directory.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </Select>
          </Field>
          <Field label="专业">
            <Select value={values.disciplineId} onChange={(event) => setValues({ ...values, disciplineId: event.target.value })}>
              {directory.disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
            </Select>
          </Field>
          {state.runtimeConfig.useMocks ? (
            <Field label="责任工程师">
              <Select value={values.ownerUserId} onChange={(event) => setValues({ ...values, ownerUserId: event.target.value })}>
                {ownerCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="位置描述">
            <TextInput value={values.locationText || ""} onChange={(event) => setValues({ ...values, locationText: event.target.value })} placeholder="轴线、楼层、设备基础或道路桩号" />
          </Field>
          <Field label="整改截止">
            <TextInput
              type="datetime-local"
              value={toDateTimeLocalInput(values.dueAt)}
              onChange={(event) => setValues({ ...values, dueAt: fromDateTimeLocalInput(event.target.value) })}
            />
          </Field>
        </div>
      </Card>
      <Card>
        <h3>照片证据</h3>
        <div className="photo-picker-head">
          <p className="muted">从我的现场图库选择发现照片。已选择 {selectedPhotoIds.length} 张，提交后绑定到新事项。</p>
          <Button variant="secondary" disabled={!availablePhotos.length} onClick={() => setIsPickingPhotos(true)}>选择照片</Button>
        </div>
        {selectedPhotos.length ? (
          <div className="photo-grid compact-photo-grid">
            {selectedPhotos.map((photo) => (
              <div key={photo.id} className="photo-tile selectable-photo selected">
                <div className="photo-thumb">photo</div>
                <strong>{photo.fileName}</strong>
                <span>已选择为发现照片</span>
                <div className="action-row">
                  <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                  <Button variant="ghost" onClick={() => togglePhoto(photo.id)}>移除</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!availablePhotos.length ? (
          <div className="empty-inline">
            <span className="muted">我的图库暂无未绑定照片。</span>
            <Button
              variant="secondary"
              onClick={() => {
                state.setIsCreatingItem(false);
                state.setMobileRoute("photo");
              }}
            >
              去拍照
            </Button>
          </div>
        ) : null}
      </Card>
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row sticky-actions">
        <Button variant="secondary" onClick={() => state.saveDraft(values, selectedPhotoIds)}>保存草稿</Button>
        <Button disabled={!canSubmit} onClick={() => state.createItemFromForm(values, { requestKey, selectedPhotoIds })}>提交审核</Button>
      </div>
      {previewPhoto ? <PhotoPreviewModal state={state} photo={previewPhoto} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function PhotoPickerPage({
  state,
  title,
  photos,
  selectedPhotoIds,
  onToggle,
  onCancel,
  onConfirm
}: {
  state: AppState;
  title: string;
  photos: PhotoAttachment[];
  selectedPhotoIds: string[];
  onToggle: (photoId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [query, setQuery] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoAttachment | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPhotos = photos.filter((photo) => {
    const haystack = [
      photo.fileName,
      formatDate(photo.uploadedAt),
      getUser(photo.uploadedBy)?.name,
      photo.areaSnapshot,
      photo.disciplineSnapshot,
      photo.responsibleOrgSnapshot
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const visiblePhotos = normalizedQuery ? filteredPhotos.slice(0, 30) : filteredPhotos.slice(0, 24);
  return (
    <div className="stack photo-picker-page">
      <PageHeader title={title} meta="我的未绑定照片" action={<Button variant="ghost" onClick={onCancel}>取消</Button>} />
      <Card>
        <TextInput placeholder="搜索文件名、日期、上传人" value={query} onChange={(event) => setQuery(event.target.value)} />
        <p className="muted">
          {normalizedQuery
            ? `搜索结果显示 ${visiblePhotos.length} / ${filteredPhotos.length} 张`
            : `默认显示最近 ${visiblePhotos.length} / ${photos.length} 张`}
        </p>
      </Card>
      <div className="photo-grid">
        {visiblePhotos.map((photo) => {
          const selected = selectedPhotoIds.includes(photo.id);
          return (
            <div key={photo.id} className={`photo-tile selectable-photo ${selected ? "selected" : ""}`}>
              <div className="photo-thumb">photo</div>
              <strong>{photo.fileName}</strong>
              <span>{formatDate(photo.uploadedAt)} · {getUser(photo.uploadedBy)?.name || "未知上传人"}</span>
              <span>{selected ? "已选择" : "未选择"}</span>
              <div className="action-row">
                <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                <Button onClick={() => onToggle(photo.id)}>{selected ? "取消选择" : "选择"}</Button>
              </div>
            </div>
          );
        })}
      </div>
      {!visiblePhotos.length ? <EmptyState title="没有匹配照片" description="换个关键词，或先到拍照页添加照片。" /> : null}
      <div className="action-row sticky-actions">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button onClick={onConfirm}>确认选择 {selectedPhotoIds.length} 张</Button>
      </div>
      {previewPhoto ? <PhotoPreviewModal state={state} photo={previewPhoto} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function ItemDetailPage({ state, user, item }: { state: AppState; user: User; item: SiteItem }) {
  const actions = allowedItemActions(state, user, item);
  const canEdit = canEditSiteItem(user, item);
  const canComment = actions.includes("comment");
  const workflowActions = actions.filter((action) => action !== "comment");
  const [selectedReviewPhotoIds, setSelectedReviewPhotoIds] = useState<string[]>([]);
  const [isPickingReviewPhotos, setIsPickingReviewPhotos] = useState(false);
  const [selectedClosePhotoIds, setSelectedClosePhotoIds] = useState<string[]>([]);
  const [isPickingClosePhotos, setIsPickingClosePhotos] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoAttachment | null>(null);
  const availableReviewPhotos = state.galleryPhotos
    .filter((photo) => !photo.siteItemId && photo.uploadedBy === user.id)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const selectedReviewPhotos = availableReviewPhotos.filter((photo) => selectedReviewPhotoIds.includes(photo.id));
  const selectedClosePhotos = availableReviewPhotos.filter((photo) => selectedClosePhotoIds.includes(photo.id));
  const photosForItem = itemPhotos(item.id, state.photos);
  const photoStages: PhotoStage[] = ["discovery", "rectification", "review"];
  const photoGroups = photoStages
    .map((stage) => ({ stage, photos: photosForItem.filter((photo) => photo.stage === stage) }))
    .filter((group) => group.photos.length);
  useEffect(() => {
    void state.refreshItemDetail(item.id);
  }, [item.id, state.refreshItemDetail]);
  function toggleReviewPhoto(photoId: string) {
    setSelectedReviewPhotoIds((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
  }
  function toggleClosePhoto(photoId: string) {
    setSelectedClosePhotoIds((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
  }
  useEffect(() => {
    if (isPickingReviewPhotos || isPickingClosePhotos) void state.refreshPhotos({ unboundOnly: true });
  }, [isPickingClosePhotos, isPickingReviewPhotos, state.refreshPhotos]);
  function submitReviewWithPhotos() {
    if (state.runtimeConfig.useMocks) {
      state.bindPhotosToItem(item, selectedReviewPhotoIds, "rectification");
    }
    void state.applyWorkflow(item, "submit_review", {
      photoIds: selectedReviewPhotoIds,
      comment: selectedReviewPhotoIds.length
        ? `整改人提交复验，已绑定${selectedReviewPhotoIds.length}张整改照片`
        : "整改人提交复验"
    });
    setSelectedReviewPhotoIds([]);
  }
  function closeWithPhotos() {
    if (state.runtimeConfig.useMocks) {
      state.bindPhotosToItem(item, selectedClosePhotoIds, "review");
    }
    void state.applyWorkflow(item, "close", {
      photoIds: selectedClosePhotoIds,
      comment: selectedClosePhotoIds.length
        ? `责任工程师关闭事项，已绑定${selectedClosePhotoIds.length}张复验照片`
        : "责任工程师关闭事项"
    });
    setSelectedClosePhotoIds([]);
  }
  function submitComment() {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    state.applyWorkflow(item, "comment", { comment: trimmed });
    setCommentText("");
    setIsCommenting(false);
  }
  if (isPickingReviewPhotos) {
    return (
      <PhotoPickerPage
        state={state}
        title="选择整改照片"
        photos={availableReviewPhotos}
        selectedPhotoIds={selectedReviewPhotoIds}
        onToggle={toggleReviewPhoto}
        onCancel={() => setIsPickingReviewPhotos(false)}
        onConfirm={() => {
          setIsPickingReviewPhotos(false);
          void state.refreshItemDetail(item.id);
        }}
      />
    );
  }
  if (isPickingClosePhotos) {
    return (
      <PhotoPickerPage
        state={state}
        title="选择复验照片"
        photos={availableReviewPhotos}
        selectedPhotoIds={selectedClosePhotoIds}
        onToggle={toggleClosePhoto}
        onCancel={() => setIsPickingClosePhotos(false)}
        onConfirm={() => {
          setIsPickingClosePhotos(false);
          void state.refreshItemDetail(item.id);
        }}
      />
    );
  }
  return (
    <div className="stack item-detail-page">
      <PageHeader title={item.itemNo} meta={item.title} action={<Button variant="ghost" onClick={() => state.setSelectedItemId(null)}>返回</Button>} />
      <div className="detail-layout">
        <div className="detail-main">
          <Card className="detail-summary-card">
            {isEditing ? (
              <ItemEditForm item={item} state={state} user={user} onCancel={() => setIsEditing(false)} onSaved={() => setIsEditing(false)} />
            ) : (
              <>
                <div className="detail-head">
                  <StatusTag status={item.status} />
                  <TimingTag overdue={isOverdue(item)} dueSoon={isDueSoon(item)} />
                  <SeverityTag severity={item.severity} />
                  <span>{typeText[item.type]}</span>
                  {canEdit ? <Button variant="secondary" onClick={() => setIsEditing(true)}>编辑事项</Button> : null}
                </div>
                <div className="detail-description">
                  <span>问题描述</span>
                  <p>{item.description || "暂无描述"}</p>
                </div>
                <dl className="detail-grid">
                  <div><dt>标段</dt><dd>{getSection(item.sectionId)?.name}</dd></div>
                  <div><dt>区域</dt><dd>{getArea(item.areaId)?.name}</dd></div>
                  <div><dt>专业</dt><dd>{getDiscipline(item.disciplineId)?.name}</dd></div>
                  <div><dt>提出人</dt><dd>{getUser(item.createdBy)?.name}</dd></div>
                  <div><dt>责任工程师</dt><dd>{getUser(item.ownerUserId)?.name}</dd></div>
                  <div><dt>责任单位</dt><dd>{getOrganization(item.responsibleOrgId)?.name || "待责任工程师派发"}</dd></div>
                  <div><dt>责任人</dt><dd>{getUser(item.responsibleUserId)?.name || "待分配"}</dd></div>
                  <div><dt>截止</dt><dd>{formatDate(item.dueAt)}</dd></div>
                </dl>
              </>
            )}
          </Card>
          <Card className="photo-evidence-card">
            <h3>照片证据</h3>
            {state.itemDetailState === "loading" ? <p className="muted">正在刷新详情...</p> : null}
            {state.itemDetailState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
            <div className="photo-evidence-groups">
              {photoGroups.map((group) => (
                <div key={group.stage} className="photo-stage-group">
                  <div className="card-title-row">
                    <h4>{photoStageLabel(group.stage)}照片</h4>
                    <span className="muted">{group.photos.length} 张</span>
                  </div>
                  <div className="photo-grid">
                    {group.photos.map((photo) => (
                      <div key={photo.id} className="photo-tile">
                        <div className="photo-thumb">{photoStageLabel(photo.stage)}</div>
                        <strong>{photo.fileName}</strong>
                        <span>{photo.areaSnapshot} · {photo.responsibleOrgSnapshot}</span>
                        <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!photosForItem.length ? <p className="muted">暂无照片证据。</p> : null}
          </Card>
        </div>
        <aside className="detail-side">
          <Card className="communication-card">
            <h3>现场沟通</h3>
            {canComment ? (
              <div className="workflow-comment-action">
                {!isCommenting ? (
                  <Button variant="secondary" onClick={() => setIsCommenting(true)}>新增评论</Button>
                ) : (
                  <>
                    <TextArea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="输入现场说明、整改沟通或复验意见"
                    />
                    <div className="action-row wrap">
                      <Button variant="secondary" onClick={() => {
                        setCommentText("");
                        setIsCommenting(false);
                      }}>
                        取消
                      </Button>
                      <Button disabled={!commentText.trim()} onClick={submitComment}>提交评论</Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="muted">当前角色暂无评论权限。</p>
            )}
          </Card>
          <Card className="workflow-card">
            <h3>流程处理</h3>
            <div className="action-row wrap">
              {workflowActions.map((action) =>
                action === "assign_rectifier" ? (
                  <AssignRectifier key={action} item={item} state={state} />
                ) : action === "dispatch" ? (
                  <DispatchItem key={action} item={item} state={state} />
                ) : action === "submit_review" ? (
                  <div key={action} className="workflow-photo-action">
                    <div className="photo-picker-head">
                      <p className="muted">先从我的现场图库选择整改照片，再提交给责任工程师复验。</p>
                      <Button variant="secondary" disabled={!availableReviewPhotos.length} onClick={() => setIsPickingReviewPhotos(true)}>
                        选择整改照片
                      </Button>
                    </div>
                    {selectedReviewPhotos.length ? (
                      <div className="photo-grid compact-photo-grid">
                        {selectedReviewPhotos.map((photo) => (
                          <div key={photo.id} className="photo-tile selectable-photo selected">
                            <div className="photo-thumb">整改</div>
                            <strong>{photo.fileName}</strong>
                            <span>将作为整改照片提交</span>
                            <div className="action-row">
                              <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                              <Button variant="ghost" onClick={() => toggleReviewPhoto(photo.id)}>移除</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        <span className="muted">{availableReviewPhotos.length ? "尚未选择整改照片。" : "我的图库暂无未绑定照片。"}</span>
                        {!availableReviewPhotos.length ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              state.setSelectedItemId(null);
                              state.setMobileRoute("photo");
                            }}
                          >
                            去拍照
                          </Button>
                        ) : null}
                      </div>
                    )}
                    <Button disabled={!selectedReviewPhotoIds.length} onClick={submitReviewWithPhotos}>提交复验</Button>
                  </div>
                ) : action === "close" ? (
                  <div key={action} className="workflow-photo-action">
                    <div className="photo-picker-head">
                      <p className="muted">可从我的现场图库选择复验照片，关闭时一并归档。</p>
                      <Button variant="secondary" disabled={!availableReviewPhotos.length} onClick={() => setIsPickingClosePhotos(true)}>
                        选择复验照片
                      </Button>
                    </div>
                    {selectedClosePhotos.length ? (
                      <div className="photo-grid compact-photo-grid">
                        {selectedClosePhotos.map((photo) => (
                          <div key={photo.id} className="photo-tile selectable-photo selected">
                            <div className="photo-thumb">复验</div>
                            <strong>{photo.fileName}</strong>
                            <span>将作为复验照片归档</span>
                            <div className="action-row">
                              <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                              <Button variant="ghost" onClick={() => toggleClosePhoto(photo.id)}>移除</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">未选择复验照片时仍可关闭，系统会保留流程日志作为签认依据。</p>
                    )}
                    <Button onClick={closeWithPhotos}>关闭事项</Button>
                  </div>
                ) : (
                  <Button key={action} variant={action === "void" ? "danger" : "secondary"} onClick={() => state.applyWorkflow(item, action)}>
                    {actionLabel(action)}
                  </Button>
                )
              )}
              {!workflowActions.length ? <span className="muted">当前没有可执行流程动作</span> : null}
            </div>
          </Card>
          <Card className="log-card">
            <h3>流程日志</h3>
            <ol className="timeline">
              {itemLogs(item.id, state.logs).map((log) => (
                <li key={log.id}>
                  <strong>{actionLabel(log.action)}</strong>
                  <span>{log.comment} · {getUser(log.actorId)?.name} · {formatDate(log.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
      {previewPhoto ? <PhotoPreviewModal state={state} photo={previewPhoto} item={item} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function ItemEditForm({
  item,
  state,
  user,
  onCancel,
  onSaved
}: {
  item: SiteItem;
  state: AppState;
  user: User;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const directory = state.directory;
  const scopedSections =
    user.role === "admin"
      ? directory.sections
      : directory.sections.filter((section) => user.sectionScopeIds.includes(section.id));
  const [requestKey] = useState(() => uniqueId("update-request"));
  const [values, setValues] = useState<UpdateSiteItemInput>({
    type: item.type,
    severity: item.severity,
    title: item.title,
    description: item.description,
    sectionId: item.sectionId,
    areaId: item.areaId,
    disciplineId: item.disciplineId,
    locationText: item.locationText,
    dueAt: item.dueAt
  });
  const canSave = Boolean(values.sectionId && values.areaId && values.disciplineId && (values.title || "").trim());
  async function save() {
    if (!canSave) return;
    const saved = await state.updateItem(item, values, requestKey);
    if (saved) onSaved();
  }
  return (
    <div className="stack compact-stack">
      <div className="card-title-row">
        <h3>编辑事项</h3>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </div>
      <div className="form-grid">
        <Field label="事项类型">
          <Select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as SiteItem["type"] })}>
            <option value="defect">缺陷</option>
            <option value="punch">尾工</option>
          </Select>
        </Field>
        <Field label="严重等级">
          <Select value={values.severity} onChange={(event) => setValues({ ...values, severity: event.target.value as SiteItem["severity"] })}>
            <option value="normal">一般</option>
            <option value="important">重要</option>
            <option value="severe">严重</option>
          </Select>
        </Field>
        <Field label="标题">
          <TextInput value={values.title || ""} onChange={(event) => setValues({ ...values, title: event.target.value })} />
        </Field>
        <Field label="描述">
          <TextArea value={values.description || ""} onChange={(event) => setValues({ ...values, description: event.target.value })} />
        </Field>
        <Field label="标段">
          <Select value={values.sectionId} onChange={(event) => setValues({ ...values, sectionId: event.target.value })}>
            {scopedSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </Select>
        </Field>
        <Field label="区域">
          <Select value={values.areaId} onChange={(event) => setValues({ ...values, areaId: event.target.value })}>
            {directory.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </Select>
        </Field>
        <Field label="专业">
          <Select value={values.disciplineId} onChange={(event) => setValues({ ...values, disciplineId: event.target.value })}>
            {directory.disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
          </Select>
        </Field>
        <Field label="位置描述">
          <TextInput value={values.locationText || ""} onChange={(event) => setValues({ ...values, locationText: event.target.value })} />
        </Field>
        <Field label="整改截止">
          <TextInput
            type="datetime-local"
            value={toDateTimeLocalInput(values.dueAt)}
            onChange={(event) => setValues({ ...values, dueAt: fromDateTimeLocalInput(event.target.value) })}
          />
        </Field>
      </div>
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!canSave} onClick={save}>保存修改</Button>
      </div>
    </div>
  );
}

function DispatchItem({ item, state }: { item: SiteItem; state: AppState }) {
  const contractorOrgs = state.directory.organizations.filter((organization) => organization.type === "contractor" && organization.isActive);
  const [organizationId, setOrganizationId] = useState(item.responsibleOrgId || contractorOrgs[0]?.id || "");
  const organizationName = directoryItem(state.directory.organizations, organizationId)?.name || "责任单位";
  useEffect(() => {
    if (!organizationId && contractorOrgs[0]?.id) setOrganizationId(contractorOrgs[0].id);
  }, [contractorOrgs, organizationId]);
  return (
    <div className="inline-form">
      <Select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
        {contractorOrgs.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
      <Button
        variant="secondary"
        disabled={!organizationId}
        onClick={() => state.applyWorkflow(item, "dispatch", { organizationId, comment: `派发给${organizationName}` })}
      >
        派发
      </Button>
    </div>
  );
}

function AssignRectifier({ item, state }: { item: SiteItem; state: AppState }) {
  const candidates = activeRectifiersForDirectory(state.directory, item.responsibleOrgId || "", item.sectionId);
  const [userId, setUserId] = useState(candidates[0]?.id || "");
  useEffect(() => {
    if (!userId && candidates[0]?.id) setUserId(candidates[0].id);
  }, [candidates, userId]);
  return (
    <div className="inline-form">
      <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
        {candidates.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </Select>
      <Button
        variant="secondary"
        disabled={!userId}
        onClick={() => state.applyWorkflow(item, "assign_rectifier", { userId, comment: "施工单位负责人分配整改人" })}
      >
        分配整改人
      </Button>
    </div>
  );
}

function PhotoPage({ state }: { state: AppState }) {
  const currentUserId = state.currentUser?.id;
  const [previewPhoto, setPreviewPhoto] = useState<PhotoAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    void state.refreshPhotos();
  }, [state.refreshPhotos]);
  const visibleUploads = state.uploadQueue.filter((upload) => upload.state !== "complete" && upload.uploadedBy === currentUserId);
  const sortedPhotos = state.galleryPhotos
    .filter((photo) => photo.uploadedBy === currentUserId)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  return (
    <div className="stack">
      <PageHeader
        title="我的现场图库"
        meta="当前账号独立管理，后续在事项表单中绑定"
        action={(
          <>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) void state.uploadPhotoFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button onClick={() => {
              if (state.runtimeConfig.useMocks) {
                state.addMockUpload();
              } else {
                fileInputRef.current?.click();
              }
            }}>
              添加照片
            </Button>
          </>
        )}
      />
      {state.photoListState === "loading" ? <p className="muted">正在刷新照片列表...</p> : null}
      {state.photoListState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <Card>
        <h3>上传队列</h3>
        <p className="muted">现场先拍照入库；绑定事项在新建、整改或复验表单中完成。</p>
        {visibleUploads.map((upload) => (
          <div key={upload.id} className="queue-card inline-queue">
            <div>
              <strong>{upload.fileName}</strong>
              <span>未绑定 · 上传队列</span>
            </div>
            <StatusPill text={upload.state} />
            <div className="action-row">
              <Button variant="secondary" onClick={() => state.setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "failed" } : item)))}>模拟失败</Button>
              <Button onClick={() => state.completeUpload(upload)}>{upload.state === "failed" ? "重试" : "完成上传"}</Button>
            </div>
          </div>
        ))}
        {!visibleUploads.length ? <p className="muted">暂无待上传照片。</p> : null}
      </Card>
      <Card>
        <h3>照片列表</h3>
        <div className="photo-grid">
          {sortedPhotos.map((photo) => {
            const item = photo.siteItemId ? state.items.find((candidate) => candidate.id === photo.siteItemId) : undefined;
            return (
              <div key={photo.id} className="photo-tile">
                <div className="photo-thumb">{photo.stage ? photoStageLabel(photo.stage) : "photo"}</div>
                <strong>{photo.fileName}</strong>
                <span>{item ? `${item.itemNo} · ${photoStageLabel(photo.stage)}` : "未绑定"}</span>
                <span>{formatDate(photo.uploadedAt)} · {getUser(photo.uploadedBy)?.name || "未知上传人"}</span>
                <div className="action-row">
                  <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
                  {!photo.siteItemId ? <Button variant="ghost" onClick={() => void state.deletePhoto(photo)}>删除</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
        {!sortedPhotos.length ? <EmptyState title="暂无照片" description="点击添加照片，将现场照片先上传到图库。" /> : null}
      </Card>
      {previewPhoto ? (
        <PhotoPreviewModal
          state={state}
          photo={previewPhoto}
          item={previewPhoto.siteItemId ? state.items.find((item) => item.id === previewPhoto.siteItemId) : undefined}
          onClose={() => setPreviewPhoto(null)}
        />
      ) : null}
    </div>
  );
}

function MobileDashboard({ state, user }: { state: AppState; user: User }) {
  const [sectionId, setSectionId] = useState("all");
  const source = scopedItems(state, user).filter((item) => sectionId === "all" || item.sectionId === sectionId);
  const summary = summarize(source);
  const byOrg = countBy(source.filter(isOverdue), (item) => getOrganization(item.responsibleOrgId)?.name);
  return (
    <div className="stack">
      <PageHeader title="移动看板" meta="手机端关键数字" />
      <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
        <option value="all">全部标段</option>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </Select>
      <div className="metric-grid">
        <MetricCard label="打开" value={summary.open} />
        <MetricCard label="待复验" value={summary.pendingReview} tone="due" />
        <MetricCard label="超期" value={summary.overdue} tone="danger" />
        <MetricCard label="关闭" value={summary.closed} tone="ok" />
      </div>
      <Card>
        <h3>超期排行</h3>
        {Object.entries(byOrg).map(([name, count]) => <BarRow key={name} label={name} value={count} max={Math.max(...Object.values(byOrg), 1)} />)}
      </Card>
    </div>
  );
}

function ProfilePage({ state, user }: { state: AppState; user: User }) {
  const unread = state.notifications.filter((notice) => notice.recipientId === user.id && !notice.readAt).length;
  const userDrafts = state.drafts.filter((draft) => draft.createdBy === user.id);
  return (
    <div className="stack">
      <PageHeader title="我的" meta={roleLabel(user.role)} action={<Button variant="ghost" onClick={() => void state.logout()}>退出</Button>} />
      <Card>
        <dl className="detail-grid">
          <div><dt>姓名</dt><dd>{user.name}</dd></div>
          <div><dt>单位</dt><dd>{getOrganization(user.organizationId)?.name}</dd></div>
          <div><dt>手机号</dt><dd>{user.phone}</dd></div>
          <div><dt>授权标段</dt><dd>{user.sectionScopeIds.map((id) => getSection(id)?.name).join("、")}</dd></div>
        </dl>
      </Card>
      <Card>
        <button className="list-row" onClick={() => state.setShowNotifications(true)}>通知 <span>{unread} 未读</span></button>
        <div className="list-row">草稿 <span>{userDrafts.length} 条</span></div>
        {userDrafts.map((draft) => (
          <button key={draft.id} className="draft-row draft-button" onClick={() => state.openDraft(draft)}>
            <strong>{draft.title}</strong>
            <span>{formatDate(draft.savedAt)} · {draft.selectedPhotoIds?.length || 0} 张照片</span>
          </button>
        ))}
        <div className="list-row">修改密码 <span>占位</span></div>
      </Card>
    </div>
  );
}

function NotificationPanel({ state, user }: { state: AppState; user: User }) {
  const notices = state.notifications.filter((notice) => notice.recipientId === user.id);
  useEffect(() => {
    void state.refreshNotifications();
  }, [state.refreshNotifications]);
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <PageHeader
          title="通知"
          action={(
            <div className="action-row wrap">
              <Button variant="secondary" onClick={() => void state.markAllNotificationsRead()}>全部已读</Button>
              <Button variant="ghost" onClick={() => state.setShowNotifications(false)}>关闭</Button>
            </div>
          )}
        />
        {state.notificationState === "loading" ? <p className="muted">正在刷新通知...</p> : null}
        {state.notificationState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
        {notices.map((notice) => (
          <button
            key={notice.id}
            className={`notice ${notice.readAt ? "" : "unread"}`}
            onClick={() => void state.markNotificationRead(notice)}
          >
            <strong>{notice.title}</strong>
            <span>{notice.content}</span>
            <small>{formatDate(notice.createdAt)}</small>
          </button>
        ))}
        {!notices.length ? <EmptyState title="暂无通知" description="新的派发、复验和催办消息会出现在这里。" /> : null}
      </section>
    </div>
  );
}

function DesktopTodo({ state, user }: { state: AppState; user: User }) {
  const visible = scopedItems(state, user);
  const actionable = state.runtimeConfig.useMocks
    ? visible.filter((item) => allowedActions(user, item).some((action) => action !== "comment"))
    : visible.filter((item) => !["closed", "voided"].includes(item.status));
  const overdue = actionable.filter(isOverdue);
  const pendingReview = actionable.filter((item) => item.status === "pending_acceptance");
  return (
    <div className="stack">
      <PageHeader
        title="待办处理"
        meta="按当前角色权限展示可处理事项"
        action={canCreateItem(user) ? <Button onClick={state.openCreateItem}>新建事项</Button> : undefined}
      />
      <div className="desktop-metrics">
        <MetricCard label="待处理" value={actionable.length} />
        <MetricCard label="待复验" value={pendingReview.length} tone="due" />
        <MetricCard label="超期" value={overdue.length} tone="danger" />
        <MetricCard label="全部可见" value={visible.length} />
        <MetricCard label="我的草稿" value={state.drafts.filter((draft) => draft.createdBy === user.id).length} tone="ok" />
      </div>
      <SiteItemTable items={actionable} state={state} emptyTitle="当前没有待处理事项" />
    </div>
  );
}

function DesktopDashboard({ state, user }: { state: AppState; user: User }) {
  const [sectionId, setSectionId] = useState("all");
  const items = scopedItems(state, user).filter((item) => sectionId === "all" || item.sectionId === sectionId);
  const summary = summarize(items);
  const byArea = countBy(items, (item) => getArea(item.areaId)?.name);
  const byOrg = countBy(items.filter(isOverdue), (item) => getOrganization(item.responsibleOrgId)?.name);
  return (
    <div className="stack">
      <PageHeader title="整改看板" meta="按标段、区域、专业、责任单位追踪闭环" />
      <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
        <option value="all">全部标段</option>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </Select>
      <div className="desktop-metrics">
        <MetricCard label="总事项" value={summary.total} />
        <MetricCard label="打开" value={summary.open} />
        <MetricCard label="待复验" value={summary.pendingReview} tone="due" />
        <MetricCard label="超期" value={summary.overdue} tone="danger" />
        <MetricCard label="已关闭" value={summary.closed} tone="ok" />
      </div>
      <div className="two-col">
        <Card><h3>区域分布</h3>{Object.entries(byArea).map(([label, value]) => <BarRow key={label} label={label} value={value} max={Math.max(...Object.values(byArea), 1)} />)}</Card>
        <Card><h3>超期责任单位</h3>{Object.entries(byOrg).map(([label, value]) => <BarRow key={label} label={label} value={value} max={Math.max(...Object.values(byOrg), 1)} />)}</Card>
      </div>
    </div>
  );
}

function DesktopItems({ state, user }: { state: AppState; user: User }) {
  const [filters, setFilters] = useState<ItemFilterValues>({
    status: "open",
    type: "all",
    severity: "all",
    sectionId: "all",
    areaId: "all",
    disciplineId: "all",
    organizationId: "all",
    timing: "all"
  });
  const [query, setQuery] = useState("");
  const [openFilter, setOpenFilter] = useState<keyof ItemFilterValues | null>(null);
  useEffect(() => {
    void state.refreshSiteItems(filters, query);
  }, [filters, query, state.refreshSiteItems]);
  const items = scopedItems(state, user).filter((item) => {
    const text = [
      item.itemNo,
      item.title,
      getSection(item.sectionId)?.name,
      getArea(item.areaId)?.name,
      getDiscipline(item.disciplineId)?.name,
      getOrganization(item.responsibleOrgId)?.name,
      getUser(item.responsibleUserId)?.name
    ].join("");
    return matchesItemFilter(filters, item, user, state) && (state.runtimeConfig.useMocks ? text.includes(query) : true);
  });
  function updateFilter<K extends keyof ItemFilterValues>(key: K, value: ItemFilterValues[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }
  useEffect(() => {
    if (!openFilter) return undefined;
    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".desktop-filter-bar")) setOpenFilter(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openFilter]);
  return (
    <div className="stack">
      <PageHeader
        title="事项管理"
        meta="台账式浏览、详情处理与导出入口"
        action={(
          <div className="action-row wrap">
            {canCreateItem(user) ? <Button onClick={state.openCreateItem}>新建事项</Button> : null}
            {canExportItemData(user) ? <Button variant="secondary">导出 Excel</Button> : null}
          </div>
        )}
      />
      <div className="filter-bar desktop-filter-bar">
        <TextInput placeholder="搜索编号、标题、区域、单位、责任人" value={query} onFocus={() => setOpenFilter(null)} onChange={(event) => setQuery(event.target.value)} />
        <DesktopFilterSelect
          label="状态"
          value={filters.status}
          open={openFilter === "status"}
          options={[
            { value: "open", label: "进行中" },
            { value: "mine", label: "我的待办" },
            { value: "pending_approval", label: "待审核" },
            { value: "dispatched", label: "已派发" },
            { value: "rectifying", label: "整改中" },
            { value: "pending_acceptance", label: "待复验" },
            { value: "closed", label: "已关闭" },
            { value: "voided", label: "已作废" }
          ]}
          onToggle={() => setOpenFilter(openFilter === "status" ? null : "status")}
          onChange={(value) => {
            updateFilter("status", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="类型"
          value={filters.type}
          open={openFilter === "type"}
          options={[
            { value: "all", label: "全部类型" },
            { value: "defect", label: "缺陷" },
            { value: "punch", label: "尾工" }
          ]}
          onToggle={() => setOpenFilter(openFilter === "type" ? null : "type")}
          onChange={(value) => {
            updateFilter("type", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="等级"
          value={filters.severity}
          open={openFilter === "severity"}
          options={[
            { value: "all", label: "全部等级" },
            { value: "normal", label: "一般" },
            { value: "important", label: "重要" },
            { value: "severe", label: "严重" }
          ]}
          onToggle={() => setOpenFilter(openFilter === "severity" ? null : "severity")}
          onChange={(value) => {
            updateFilter("severity", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="标段"
          value={filters.sectionId}
          open={openFilter === "sectionId"}
          options={[{ value: "all", label: "全部标段" }, ...sections.map((section) => ({ value: section.id, label: section.name }))]}
          onToggle={() => setOpenFilter(openFilter === "sectionId" ? null : "sectionId")}
          onChange={(value) => {
            updateFilter("sectionId", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="区域"
          value={filters.areaId}
          open={openFilter === "areaId"}
          options={[{ value: "all", label: "全部区域" }, ...areas.map((area) => ({ value: area.id, label: area.name }))]}
          onToggle={() => setOpenFilter(openFilter === "areaId" ? null : "areaId")}
          onChange={(value) => {
            updateFilter("areaId", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="专业"
          value={filters.disciplineId}
          open={openFilter === "disciplineId"}
          options={[{ value: "all", label: "全部专业" }, ...disciplines.map((discipline) => ({ value: discipline.id, label: discipline.name }))]}
          onToggle={() => setOpenFilter(openFilter === "disciplineId" ? null : "disciplineId")}
          onChange={(value) => {
            updateFilter("disciplineId", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="责任单位"
          value={filters.organizationId}
          open={openFilter === "organizationId"}
          options={[
            { value: "all", label: "全部责任单位" },
            ...organizations.filter((organization) => organization.type === "contractor").map((organization) => ({ value: organization.id, label: organization.name }))
          ]}
          onToggle={() => setOpenFilter(openFilter === "organizationId" ? null : "organizationId")}
          onChange={(value) => {
            updateFilter("organizationId", value);
            setOpenFilter(null);
          }}
        />
        <DesktopFilterSelect
          label="时限"
          value={filters.timing}
          open={openFilter === "timing"}
          options={[
            { value: "all", label: "全部时限" },
            { value: "dueSoon", label: "临期" },
            { value: "overdue", label: "超期" }
          ]}
          onToggle={() => setOpenFilter(openFilter === "timing" ? null : "timing")}
          onChange={(value) => {
            updateFilter("timing", value);
            setOpenFilter(null);
          }}
        />
      </div>
      {state.itemListState === "loading" ? <p className="muted">正在刷新事项列表...</p> : null}
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <SiteItemTable items={items} state={state} emptyTitle="当前没有可见事项" />
    </div>
  );
}

function DesktopFilterSelect({
  label,
  value,
  options,
  open,
  onToggle,
  onChange
}: {
  label: string;
  value: string;
  options: FilterSelectOption[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className="filter-select">
      <button type="button" className={`input filter-select-button ${open ? "open" : ""}`} aria-expanded={open} aria-haspopup="listbox" onClick={onToggle}>
        <span>{selected.label}</span>
        <span aria-hidden="true">v</span>
      </button>
      {open ? (
        <div className="filter-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`filter-select-option ${option.value === value ? "active" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SiteItemTable({ items, state, emptyTitle }: { items: SiteItem[]; state: AppState; emptyTitle: string }) {
  if (!items.length) return <EmptyState title={emptyTitle} description="切换角色、筛选条件或新建事项后再查看。" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {["编号", "类型", "状态", "等级", "标题", "标段", "区域/专业", "责任单位", "责任人", "截止", "照片", "操作"].map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.itemNo}</td>
              <td>{typeText[item.type]}</td>
              <td><StatusTag status={item.status} /></td>
              <td><SeverityTag severity={item.severity} /></td>
              <td>{item.title}</td>
              <td>{getSection(item.sectionId)?.name || "-"}</td>
              <td>{getArea(item.areaId)?.name || "-"} / {getDiscipline(item.disciplineId)?.name || "-"}</td>
              <td>{getOrganization(item.responsibleOrgId)?.name || "待责任工程师派发"}</td>
              <td>{getUser(item.responsibleUserId)?.name || "待分配"}</td>
              <td>{formatDate(item.dueAt)}</td>
              <td>{itemPhotos(item.id, state.photos).length} 张</td>
              <td>
                <Button variant="secondary" onClick={() => state.setSelectedItemId(item.id)}>打开处理</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrawingAdmin({ state, user }: { state: AppState; user: User }) {
  const [search, setSearch] = useState("");
  const [selectedRevision, setSelectedRevision] = useState<DrawingRevision | null>(null);
  const drawingsToShow = state.drawingRecords.filter((drawing) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${drawing.name} ${drawing.code}`.toLowerCase().includes(query);
  });
  useEffect(() => {
    void state.refreshDrawings();
  }, [state.refreshDrawings]);
  return (
    <div className="stack">
      <PageHeader title="图纸管理" meta="区域图纸、版本和预览入口" action={<Button variant="secondary" disabled>上传图纸</Button>} />
      <div className="filter-grid compact-filters">
        <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索图纸名称或编号" />
        <Button variant="secondary" onClick={() => state.refreshDrawings()}>刷新</Button>
      </div>
      {state.drawingListState === "loading" ? <p className="muted">正在加载图纸...</p> : null}
      {state.drawingListState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      {drawingsToShow.map((drawing) => (
        <DrawingCard
          key={drawing.id}
          drawing={drawing}
          state={state}
          user={user}
          onPreview={(revision) => setSelectedRevision(revision)}
        />
      ))}
      {!drawingsToShow.length && state.drawingListState !== "loading" ? <EmptyState title="暂无图纸" description="当前权限范围内没有可查看的图纸。" /> : null}
      {selectedRevision ? <DrawingPreviewModal state={state} revision={selectedRevision} onClose={() => setSelectedRevision(null)} /> : null}
    </div>
  );
}

function DrawingCard({
  drawing,
  state,
  user,
  onPreview
}: {
  drawing: DrawingWithCurrentRevision;
  state: AppState;
  user: User;
  onPreview: (revision: DrawingRevision) => void;
}) {
  const [expandedRevisionId, setExpandedRevisionId] = useState(drawing.currentRevision?.id || drawing.revisions[0]?.id || "");
  const currentRevision = drawing.currentRevision || drawing.revisions.find((revision) => revision.isCurrent);
  const expandedRevision = drawing.revisions.find((revision) => revision.id === expandedRevisionId);
  const expandedPages = state.runtimeConfig.useMocks ? expandedRevision?.pages ?? [] : state.drawingPagesByRevision[expandedRevisionId] || [];
  useEffect(() => {
    void state.refreshDrawingRevisions(drawing.id);
  }, [drawing.id, state.refreshDrawingRevisions]);
  useEffect(() => {
    if (expandedRevisionId) void state.refreshDrawingPages(expandedRevisionId);
  }, [expandedRevisionId, state.refreshDrawingPages]);
  return (
    <Card>
      <div className="card-title-row">
        <div>
          <h3>{drawing.name}</h3>
          <p className="muted">
            {drawing.code} · {directoryItem(state.directory.areas, drawing.areaId)?.name || getArea(drawing.areaId)?.name || "未分区"}
            {currentRevision ? ` · 当前 ${currentRevision.revisionNo}` : ""}
          </p>
        </div>
        <span className={`tag ${drawing.isActive ? "tag-closed" : "tag-voided"}`}>{drawing.isActive ? "启用" : "停用"}</span>
      </div>
      <DataTable
        columns={["版本", "页数", "当前", "上传时间", "操作"]}
        rows={drawing.revisions.map((revision) => [
          revision.revisionNo,
          String(revision.pageCount),
          revision.isCurrent ? "是" : "否",
          formatDate(revision.uploadedAt),
          <div className="action-row compact-actions" key={revision.id}>
            <Button variant="secondary" onClick={() => {
              setExpandedRevisionId(revision.id);
              onPreview(revision);
            }}>
              预览
            </Button>
            {user.role === "admin" && !revision.isCurrent ? (
              <Button variant="ghost" onClick={() => state.setCurrentDrawingRevision(revision)}>设为当前</Button>
            ) : null}
          </div>
        ])}
      />
      {expandedRevisionId ? (
        <div className="page-chip-row">
          {expandedPages.map((page) => (
            <span key={page.id} className="tag tag-dispatched">第 {page.pageNumber} 页</span>
          ))}
          {!expandedPages.length ? <span className="muted">暂无页面预览数据。</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

function DrawingPreviewModal({ state, revision, onClose }: { state: AppState; revision: DrawingRevision; onClose: () => void }) {
  const previewUrl = state.drawingPreviewUrls[revision.id];
  useEffect(() => {
    void state.loadDrawingPreview(revision.id);
  }, [revision.id, state.loadDrawingPreview]);
  return (
    <div className="modal-backdrop">
      <section className="modal photo-preview-modal">
        <PageHeader title="图纸预览" meta={`${revision.revisionNo} · ${revision.pageCount} 页`} action={<Button variant="ghost" onClick={onClose}>关闭</Button>} />
        <div className="photo-preview-frame drawing-preview-frame">
          {previewUrl ? (
            <iframe title={`图纸 ${revision.revisionNo}`} src={previewUrl} />
          ) : (
            <>
              <span>drawing</span>
              <strong>{revision.coverPreviewKey}</strong>
            </>
          )}
        </div>
        {state.dataError && !state.runtimeConfig.useMocks ? <p className="error-text">{state.dataError}</p> : null}
      </section>
    </div>
  );
}

function MasterDataPage({ state }: { state: AppState }) {
  useEffect(() => {
    void state.refreshDirectory();
  }, [state.refreshDirectory]);
  return (
    <div className="stack">
      <PageHeader title="基础数据" meta="标段、单位、区域、专业" action={<Button variant="secondary" disabled>Excel 导入</Button>} />
      {state.directoryState === "loading" ? <p className="muted">正在刷新基础数据...</p> : null}
      {state.directoryState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="two-col">
        <MasterDataPanel kind="sections" title="标段" records={state.directory.sections} state={state} />
        <MasterDataPanel kind="organizations" title="单位" records={state.directory.organizations} state={state} />
        <MasterDataPanel kind="areas" title="区域" records={state.directory.areas} state={state} />
        <MasterDataPanel kind="disciplines" title="专业" records={state.directory.disciplines} state={state} />
      </div>
    </div>
  );
}

function MasterDataPanel({
  kind,
  title,
  records,
  state
}: {
  kind: MasterDataKind;
  title: string;
  records: MasterDataRecord[];
  state: AppState;
}) {
  const [editing, setEditing] = useState<MasterDataRecord | "new" | null>(null);
  return (
    <Card>
      <div className="card-title-row">
        <h3>{title}</h3>
        <Button variant="secondary" onClick={() => setEditing("new")}>新增</Button>
      </div>
      {editing ? (
        <MasterDataForm
          kind={kind}
          record={editing === "new" ? undefined : editing}
          state={state}
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}
      <DataTable
        columns={["编码/类型", "名称", "状态", "操作"]}
        rows={records.map((record) => [
          masterDataMeta(kind, record),
          record.name,
          record.isActive ? "启用" : "停用",
          <div className="action-row compact-actions" key={record.id}>
            <Button variant="secondary" onClick={() => setEditing(record)}>编辑</Button>
            <Button
              variant="ghost"
              onClick={() => state.updateMasterData(kind, record, { isActive: !record.isActive })}
            >
              {record.isActive ? "停用" : "启用"}
            </Button>
          </div>
        ])}
      />
    </Card>
  );
}

function MasterDataForm({
  kind,
  record,
  state,
  onCancel,
  onSaved
}: {
  kind: MasterDataKind;
  record?: MasterDataRecord;
  state: AppState;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<MasterDataWriteInput>({
    name: record?.name || "",
    code: record && "code" in record ? record.code : "",
    isActive: record?.isActive ?? true,
    type: kind === "organizations" && record && "type" in record ? record.type : "contractor",
    parentId: kind === "areas" && record && "parentId" in record ? record.parentId || "" : ""
  });
  const canSave = Boolean(values.name?.trim() && (kind === "organizations" || values.code?.trim()));
  async function save() {
    if (!canSave) return;
    const input: MasterDataWriteInput = {
      name: values.name,
      code: kind === "organizations" ? undefined : values.code,
      isActive: values.isActive,
      type: kind === "organizations" ? values.type : undefined,
      parentId: kind === "areas" ? values.parentId || null : undefined
    };
    const saved = record
      ? await state.updateMasterData(kind, record, input)
      : await state.createMasterData(kind, input);
    if (saved) onSaved();
  }
  return (
    <div className="inline-editor">
      <div className="form-grid">
        {kind !== "organizations" ? (
          <Field label="编码">
            <TextInput value={values.code || ""} onChange={(event) => setValues({ ...values, code: event.target.value })} />
          </Field>
        ) : null}
        <Field label="名称">
          <TextInput value={values.name || ""} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        </Field>
        {kind === "organizations" ? (
          <Field label="单位类型">
            <Select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as Organization["type"] })}>
              <option value="owner">业主</option>
              <option value="supervisor">监理</option>
              <option value="contractor">施工单位</option>
              <option value="other">其他</option>
            </Select>
          </Field>
        ) : null}
        {kind === "areas" ? (
          <Field label="上级区域">
            <Select value={values.parentId || ""} onChange={(event) => setValues({ ...values, parentId: event.target.value || null })}>
              <option value="">无</option>
              {state.directory.areas
                .filter((area) => area.id !== record?.id)
                .map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="状态">
          <Select value={values.isActive ? "active" : "inactive"} onChange={(event) => setValues({ ...values, isActive: event.target.value === "active" })}>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </Select>
        </Field>
      </div>
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!canSave} onClick={save}>保存</Button>
      </div>
    </div>
  );
}

function masterDataMeta(kind: MasterDataKind, record: MasterDataRecord): string {
  if (kind === "organizations" && "type" in record) return record.type;
  return "code" in record ? record.code : "-";
}

function UsersPage({ state }: { state: AppState }) {
  useEffect(() => {
    void state.refreshDirectory();
  }, [state.refreshDirectory]);
  return (
    <div className="stack">
      <PageHeader title="用户与权限" meta="角色、单位、标段授权" action={<Button>创建用户</Button>} />
      {state.directoryState === "loading" ? <p className="muted">正在刷新用户目录...</p> : null}
      {state.directoryState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <DataTable
        columns={["姓名", "角色", "单位", "状态", "授权标段"]}
        rows={state.directory.users.map((user) => [
          user.name,
          roleLabel(user.role),
          directoryItem(state.directory.organizations, user.organizationId)?.name || "-",
          user.isActive ? "启用" : "停用",
          user.sectionScopeIds.map((id) => directoryItem(state.directory.sections, id)?.name).join("、")
        ])}
      />
    </div>
  );
}

function ExportsPage() {
  return (
    <div className="stack">
      <PageHeader title="导入导出" meta="台账、照片包、PDF 闭环单任务" action={<Button>新建导出</Button>} />
      <DataTable
        columns={["任务", "类型", "状态", "发起人", "创建时间", "下载"]}
        rows={exportJobs.map((job) => [job.id, job.type, job.status, getUser(job.requestedBy)?.name || "-", formatDate(job.createdAt), job.status === "succeeded" ? "下载" : "-"])}
      />
    </div>
  );
}

function AuditPage({ state }: { state: AppState }) {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  useEffect(() => {
    void state.refreshAuditLogs({
      resourceType: resourceType.trim() || undefined,
      action: action.trim() || undefined
    });
  }, [action, resourceType, state.refreshAuditLogs]);
  return (
    <div className="stack">
      <PageHeader title="审计日志" meta="按用户、时间、资源、动作筛选" action={<Button variant="secondary">导出审计</Button>} />
      <div className="filter-bar">
        <TextInput placeholder="资源类型，例如 SiteItem" value={resourceType} onChange={(event) => setResourceType(event.target.value)} />
        <TextInput placeholder="动作，例如 create" value={action} onChange={(event) => setAction(event.target.value)} />
      </div>
      {state.auditLogState === "loading" ? <p className="muted">正在刷新审计日志...</p> : null}
      {state.auditLogState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <DataTable
        columns={["时间", "用户", "动作", "资源", "资源 ID"]}
        rows={state.auditLogRecords.map((log) => [formatDate(log.createdAt), getUser(log.actorId)?.name || "-", log.action, log.resourceType, log.resourceId])}
      />
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div><i style={{ width: `${Math.max((value / max) * 100, 8)}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ text }: { text: string }) {
  return <span className={`tag upload-${text}`}>{text}</span>;
}

function PhotoPreviewModal({ state, photo, item, onClose }: { state: AppState; photo: PhotoAttachment; item?: SiteItem; onClose: () => void }) {
  const previewUrl = state.photoPreviewUrls[photo.id];
  useEffect(() => {
    void state.loadPhotoPreview(photo.id);
  }, [photo.id, state.loadPhotoPreview]);
  return (
    <div className="modal-backdrop">
      <section className="modal photo-preview-modal">
        <PageHeader title="照片预览" meta={photo.fileName} action={<Button variant="ghost" onClick={onClose}>关闭</Button>} />
        <div className="photo-preview-frame">
          {previewUrl ? (
            <img src={previewUrl} alt={photo.fileName} />
          ) : (
            <>
              <span>{photoStageLabel(photo.stage)}</span>
              <strong>{photo.fileName}</strong>
            </>
          )}
        </div>
        {state.dataError && !state.runtimeConfig.useMocks ? <p className="error-text">{state.dataError}</p> : null}
        <dl className="detail-grid">
          <div><dt>状态</dt><dd>{item ? `${item.itemNo} · ${photoStageLabel(photo.stage)}` : "未绑定"}</dd></div>
          <div><dt>上传人</dt><dd>{getUser(photo.uploadedBy)?.name || "未知上传人"}</dd></div>
          <div><dt>上传时间</dt><dd>{formatDate(photo.uploadedAt)}</dd></div>
          <div><dt>区域</dt><dd>{photo.areaSnapshot || "-"}</dd></div>
          <div><dt>专业</dt><dd>{photo.disciplineSnapshot || "-"}</dd></div>
          <div><dt>责任单位</dt><dd>{photo.responsibleOrgSnapshot || "-"}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function photoStageLabel(stage?: PhotoStage) {
  if (!stage) return "未绑定";
  const labels: Record<PhotoStage, string> = {
    discovery: "发现",
    rectification: "整改",
    review: "复验"
  };
  return labels[stage];
}

function roleLabel(role: User["role"]) {
  const labels: Record<User["role"], string> = {
    admin: "管理员",
    supervisor: "业主/监理",
    contractor_manager: "施工单位负责人",
    rectifier: "现场整改人"
  };
  return labels[role];
}

function actionLabel(action: WorkflowAction) {
  const labels: Record<WorkflowAction, string> = {
    create: "新建",
    dispatch: "派发",
    assign_rectifier: "分配整改人",
    start_rectify: "开始整改",
    submit_review: "提交复验",
    return_rectification: "退回复改",
    close: "关闭",
    void: "作废",
    reopen: "重开",
    comment: "评论"
  };
  return labels[action];
}
