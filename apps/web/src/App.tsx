import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ApiClient, ApiError } from "./api/client";
import { ExportsApi, type ExportDownload } from "./api/exports";
import { readFrontendConfig, type FrontendRuntimeConfig } from "./api/env";
import { AuditApi, type AuditLogQuery } from "./api/audit";
import { AuthApi } from "./api/auth";
import { IdempotencyKeyStore } from "./api/idempotency";
import { MasterDataApi, type MasterDataKind, type MasterDataPayload, type MasterDataRecord, type MasterDataWriteInput } from "./api/masterData";
import { NotificationsApi } from "./api/notifications";
import { PhotosApi, type PhotoCompleteInput, type PhotoListQuery } from "./api/photos";
import { SettingsApi, type SystemSettings, type SystemSettingsUpdateInput } from "./api/settings";
import { SiteItemsApi, flattenGroupedPhotos, type CreateSiteItemInput, type SiteItemDetailPayload, type SiteItemListQuery, type SiteItemWorkflowInput, type UpdateSiteItemInput } from "./api/siteItems";
import { clearStoredToken, readStoredToken, saveStoredToken } from "./api/session";
import { UsersApi, type UserWriteInput } from "./api/users";
import {
  areas,
  auditLogs,
  disciplines,
  exportJobs,
  importJobs,
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
  DraftItem,
  ExportJob,
  ImportJob,
  ImportKind,
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
type MobileRoute = "todo" | "items" | "photo" | "profile";
type DesktopRoute = "workbench" | "photo" | "master" | "exports" | "settings";
type ItemCenterTab = "todo" | "items" | "dashboard";
type MasterCenterTab = "directory" | "users";
type SettingsCenterTab = "settings" | "audit";
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

const defaultSystemSettings: SystemSettings = {
  objectStorage: {
    endpoint: "",
    bucket: "",
    activeProfileId: "default",
    profiles: [
      {
        id: "default",
        name: "默认存储",
        endpoint: "",
        bucket: "",
        capacityBytes: undefined,
        accessKeyConfigured: false,
        secretKeyConfigured: false,
        isActive: true,
        usage: {
          status: "error",
          checkedAt: "",
          message: "尚未配置对象存储"
        }
      }
    ],
    accessKeyConfigured: false,
    secretKeyConfigured: false
  },
  uploads: {
    maxBytes: 10 * 1024 * 1024
  },
  features: {
    objectStorageEditable: false,
    backupsManagedExternally: true
  }
};

function mockObjectStorageSettings(
  previous: SystemSettings["objectStorage"],
  input: SystemSettingsUpdateInput["objectStorage"]
): SystemSettings["objectStorage"] {
  if (!input) return previous;
  const profiles = input.profiles?.length
    ? input.profiles.map((profile, index) => {
        const previousProfile = previous.profiles.find((candidate) => candidate.id === profile.id);
        return {
          id: profile.id || `storage-${index + 1}`,
          name: profile.name || previousProfile?.name || `存储 ${index + 1}`,
          endpoint: profile.endpoint || previousProfile?.endpoint || "",
          bucket: profile.bucket || previousProfile?.bucket || "",
          capacityBytes: profile.capacityBytes ?? previousProfile?.capacityBytes,
          accessKeyConfigured: Boolean(profile.accessKey || previousProfile?.accessKeyConfigured),
          secretKeyConfigured: Boolean(profile.secretKey || previousProfile?.secretKeyConfigured),
          isActive: false,
          usage: previousProfile?.usage || {
            status: "error" as const,
            capacityBytes: profile.capacityBytes,
            checkedAt: "",
            message: "仅真实 API 模式检测容量"
          }
        };
      })
    : previous.profiles.map((profile) =>
        profile.id === previous.activeProfileId
          ? {
              ...profile,
              endpoint: input.endpoint ?? profile.endpoint,
              bucket: input.bucket ?? profile.bucket,
              accessKeyConfigured: Boolean(input.accessKey || profile.accessKeyConfigured),
              secretKeyConfigured: Boolean(input.secretKey || profile.secretKeyConfigured)
            }
          : profile
      );
  const activeProfileId = input.activeProfileId || previous.activeProfileId || profiles[0]?.id || "";
  const normalized = profiles.map((profile) => ({ ...profile, isActive: profile.id === activeProfileId }));
  const active = normalized.find((profile) => profile.id === activeProfileId) || normalized[0];
  return {
    endpoint: active?.endpoint || "",
    bucket: active?.bucket || "",
    activeProfileId: active?.id || "",
    profiles: normalized,
    accessKeyConfigured: Boolean(active?.accessKeyConfigured),
    secretKeyConfigured: Boolean(active?.secretKeyConfigured)
  };
}

const mobileTabs: Array<RoleScopedTab<MobileRoute> & { icon: string }> = [
  { id: "todo", label: "待办", icon: "□" },
  { id: "items", label: "事项", icon: "≡" },
  { id: "photo", label: "拍照", icon: "+" },
  { id: "profile", label: "设置", icon: "●" }
];

const desktopTabs: Array<RoleScopedTab<DesktopRoute>> = [
  { id: "workbench", label: "事项中心" },
  { id: "photo", label: "现场图库" },
  { id: "master", label: "基础数据", roles: ["admin"] },
  { id: "exports", label: "导入导出", roles: ["admin", "supervisor", "contractor_manager"] },
  { id: "settings", label: "系统设置" }
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

function downloadExportArtifact(download: ExportDownload) {
  if (download.downloadUrl) {
    window.open(download.downloadUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (!download.contentBase64) return;
  const binary = atob(download.contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: download.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = download.fileName;
  link.click();
  URL.revokeObjectURL(url);
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

function visiblePhotoCount(item: SiteItem, photos: PhotoAttachment[]): number {
  return item.photoCount ?? itemPhotos(item.id, photos).length;
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

function directorySections(directory: DirectoryData): Section[] {
  return directory.sections.length ? directory.sections : sections;
}

function directoryAreas(directory: DirectoryData): Area[] {
  return directory.areas.length ? directory.areas : areas;
}

function directoryDisciplines(directory: DirectoryData): Discipline[] {
  return directory.disciplines.length ? directory.disciplines : disciplines;
}

function directoryOrganizations(directory: DirectoryData): Organization[] {
  return directory.organizations.length ? directory.organizations : organizations;
}

function directoryUsers(directory: DirectoryData): User[] {
  return directory.users.length ? directory.users : users;
}

function sectionName(directory: DirectoryData, id?: string): string {
  return directoryItem(directorySections(directory), id)?.name ?? getSection(id)?.name ?? "-";
}

function areaName(directory: DirectoryData, id?: string): string {
  return directoryItem(directoryAreas(directory), id)?.name ?? getArea(id)?.name ?? "-";
}

function disciplineName(directory: DirectoryData, id?: string): string {
  return directoryItem(directoryDisciplines(directory), id)?.name ?? getDiscipline(id)?.name ?? "-";
}

function organizationName(directory: DirectoryData, id?: string): string {
  return directoryItem(directoryOrganizations(directory), id)?.name ?? getOrganization(id)?.name ?? "待责任工程师派发";
}

function userName(directory: DirectoryData, id?: string): string {
  return directoryItem(directoryUsers(directory), id)?.name ?? getUser(id)?.name ?? "未知用户";
}

function sectionScopeText(directory: DirectoryData, user: User): string {
  const activeSections = directorySections(directory).filter((section) => section.isActive);
  const scopedIds = new Set(user.sectionScopeIds);
  const scopedSections = activeSections.filter((section) => scopedIds.has(section.id));
  if (user.role === "admin" || scopedSections.length === activeSections.length) return `全部标段（${activeSections.length} 个）`;
  return scopedSections.length ? scopedSections.map((section) => section.name).join("、") : "未配置授权标段";
}

function formatBytes(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function bytesToGbInput(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round((value / 1024 / 1024 / 1024) * 100) / 100);
}

function gbInputToBytes(value?: string): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const gb = Number(trimmed);
  if (!Number.isFinite(gb) || gb < 0) return undefined;
  return Math.round(gb * 1024 * 1024 * 1024);
}

function storageUsageText(profile: SystemSettings["objectStorage"]["profiles"][number]): string {
  if (profile.usage.status === "ok") {
    if (profile.usage.capacityBytes !== undefined) {
      return `剩余 ${formatBytes(profile.usage.remainingBytes)} / 总 ${formatBytes(profile.usage.capacityBytes)} · 已用 ${formatBytes(profile.usage.usedBytes)}`;
    }
    return `已用 ${formatBytes(profile.usage.usedBytes)} · ${profile.usage.objectCount ?? 0} 个对象 · 未配置总容量`;
  }
  return profile.usage.message || "暂无法检测容量";
}

function ownerCandidatesForDirectory(directory: DirectoryData, sectionId?: string) {
  const candidates = directoryUsers(directory).filter(
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
  return directoryUsers(directory).filter(
    (user) =>
      user.role === "rectifier" &&
      user.organizationId === organizationId &&
      user.isActive &&
      (!sectionId || user.sectionScopeIds.includes(sectionId))
  );
}

function canEditSiteItem(user: User, item: SiteItem): boolean {
  if (item.status !== "pending_approval") return false;
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
  const exportsApi = useMemo(() => new ExportsApi(apiClient), [apiClient]);
  const masterDataApi = useMemo(() => new MasterDataApi(apiClient), [apiClient]);
  const siteItemsApi = useMemo(() => new SiteItemsApi(apiClient), [apiClient]);
  const photosApi = useMemo(() => new PhotosApi(apiClient), [apiClient]);
  const settingsApi = useMemo(() => new SettingsApi(apiClient), [apiClient]);
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
  const [settingsState, setSettingsState] = useState<LoadState>("idle");
  const [directoryState, setDirectoryState] = useState<LoadState>("idle");
  const [items, setItems] = useState<SiteItem[]>(() => (runtimeConfig.useMocks ? siteItems : []));
  const [photos, setPhotos] = useState<PhotoAttachment[]>(() => (runtimeConfig.useMocks ? initialPhotos : []));
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoAttachment[]>(() => (runtimeConfig.useMocks ? initialPhotos : []));
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<WorkflowLog[]>(() => (runtimeConfig.useMocks ? initialWorkflowLogs : []));
  const [allowedActionsByItem, setAllowedActionsByItem] = useState<Record<string, WorkflowAction[]>>({});
  const [notifications, setNotifications] = useState<Notification[]>(() => (runtimeConfig.useMocks ? initialNotifications : []));
  const [auditLogRecords, setAuditLogRecords] = useState<AuditLog[]>(() => (runtimeConfig.useMocks ? auditLogs : []));
  const [exportJobRecords, setExportJobRecords] = useState<ExportJob[]>(() => (runtimeConfig.useMocks ? exportJobs : []));
  const [importJobRecords, setImportJobRecords] = useState<ImportJob[]>(() => (runtimeConfig.useMocks ? importJobs : []));
  const [directory, setDirectory] = useState<DirectoryData>(() => (runtimeConfig.useMocks ? initialDirectory : emptyDirectory));
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeDraft, setActiveDraft] = useState<DraftItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [mobileRoute, setMobileRoute] = useState<MobileRoute>("todo");
  const [desktopRoute, setDesktopRoute] = useState<DesktopRoute>("workbench");
  const [itemCenterTab, setItemCenterTab] = useState<ItemCenterTab>("todo");
  const [masterCenterTab, setMasterCenterTab] = useState<MasterCenterTab>("directory");
  const [settingsCenterTab, setSettingsCenterTab] = useState<SettingsCenterTab>("settings");
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

  const refreshSystemSettings = useCallback(async () => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated") {
      setSystemSettings(defaultSystemSettings);
      return;
    }
    setSettingsState("loading");
    try {
      setSystemSettings(await settingsApi.get());
      setDataError(null);
      setSettingsState("idle");
    } catch (error) {
      setDataError(errorMessage(error));
      setSettingsState("error");
    }
  }, [authStatus, runtimeConfig.useMocks, settingsApi]);

  const saveSystemSettings = useCallback(
    async (input: SystemSettingsUpdateInput) => {
      if (runtimeConfig.useMocks) {
        setSystemSettings((prev) => ({
          objectStorage: mockObjectStorageSettings(prev.objectStorage, input.objectStorage),
          uploads: {
            maxBytes: input.uploads?.maxBytes ?? prev.uploads.maxBytes
          },
          features: {
            objectStorageEditable: true,
            backupsManagedExternally: input.features?.backupsManagedExternally ?? prev.features.backupsManagedExternally
          }
        }));
        setDataError(null);
        return true;
      }
      setSettingsState("loading");
      try {
        setSystemSettings(await settingsApi.update(input));
        setDataError(null);
        setSettingsState("idle");
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        setSettingsState("error");
        return false;
      }
    },
    [runtimeConfig.useMocks, settingsApi]
  );

  const refreshDirectory = useCallback(async () => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated") return;
    setDirectoryState("loading");
    try {
      const [masterData, loadedUsers] = await Promise.all([
        masterDataApi.all(),
        usersApi.visible()
      ]);
      setDirectory({ ...masterData, users: loadedUsers });
      setDataError(null);
      setDirectoryState("idle");
    } catch (error) {
      setDataError(errorMessage(error));
      setDirectoryState("error");
    }
  }, [authStatus, masterDataApi, runtimeConfig.useMocks, usersApi]);

  const createExportJob = useCallback(
    async (type: ExportJob["type"], options: { itemId?: string; itemQuery?: SiteItemListQuery; auditQuery?: AuditLogQuery } = {}) => {
      if (!currentUser || !canExportItemData(currentUser)) return undefined;
      if (type === "audit" && currentUser.role !== "admin") return undefined;
      if (type === "pdf" && !options.itemId) {
        setDataError("请选择要导出的事项。");
        return undefined;
      }
      try {
        const job = runtimeConfig.useMocks
          ? {
              id: uniqueId("export"),
              type,
              status: "succeeded" as const,
              requestedBy: currentUser.id,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              artifactFileName: `${type}-${Date.now()}.csv`,
              artifactMimeType: "text/csv; charset=utf-8"
            }
          : type === "excel"
            ? await exportsApi.createSiteItemLedger(options.itemQuery)
            : type === "photo_package"
              ? await exportsApi.createPhotoPackage(options.itemQuery)
              : type === "pdf"
                ? await exportsApi.createCloseoutPdf(options.itemId!)
                : await exportsApi.createAuditExport(options.auditQuery);
        setExportJobRecords((prev) => upsertById(prev, job));
        setDataError(null);
        return job;
      } catch (error) {
        setDataError(errorMessage(error));
        return undefined;
      }
    },
    [currentUser, exportsApi, runtimeConfig.useMocks]
  );

  const downloadExportJob = useCallback(
    async (jobId: string) => {
      const job = exportJobRecords.find((candidate) => candidate.id === jobId);
      if (runtimeConfig.useMocks) {
        setDataError(null);
        return;
      }
      if (!job || job.status !== "succeeded") return;
      try {
        downloadExportArtifact(await exportsApi.downloadExport(jobId));
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [exportJobRecords, exportsApi, runtimeConfig.useMocks]
  );

  const refreshExportJob = useCallback(
    async (jobId: string) => {
      if (runtimeConfig.useMocks) {
        setDataError(null);
        return;
      }
      try {
        const job = await exportsApi.getExportJob(jobId);
        setExportJobRecords((prev) => upsertById(prev, job));
        setDataError(null);
      } catch (error) {
        setDataError(errorMessage(error));
      }
    },
    [exportsApi, runtimeConfig.useMocks]
  );

  const createImportJob = useCallback(
    async (kind: ImportKind, csvText: string, sourceFileName?: string) => {
      if (!currentUser || currentUser.role !== "admin") return undefined;
      try {
        const job = runtimeConfig.useMocks
          ? {
              id: uniqueId("import"),
              kind,
              status: "succeeded" as const,
              requestedBy: currentUser.id,
              sourceFileName,
              acceptedRows: Math.max(csvText.trim().split(/\r?\n/).length - 1, 0),
              rejectedRows: 0,
              errors: [],
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString()
            }
          : await exportsApi.createImport(kind, { csvText, sourceFileName }, apiIdempotencyKeys.current.get(`import:${kind}:${sourceFileName ?? "paste"}`, "admin-write"));
        setImportJobRecords((prev) => upsertById(prev, job));
        await refreshDirectory();
        setDataError(null);
        return job;
      } catch (error) {
        setDataError(errorMessage(error));
        return undefined;
      }
    },
    [currentUser, exportsApi, refreshDirectory, runtimeConfig.useMocks]
  );

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

  async function createUser(input: UserWriteInput, requestKey: string): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      const key = apiIdempotencyKeys.current.get(requestKey, "admin-write");
      try {
        await usersApi.create(input, key);
        apiIdempotencyKeys.current.clear(requestKey);
        await refreshDirectory();
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    const newUser: User = {
      id: `user-${Date.now()}`,
      organizationId: input.organizationId || directory.organizations[0]?.id || "",
      name: input.name || "未命名用户",
      phone: input.phone || "",
      username: input.username || `user-${Date.now()}`,
      role: input.role || "rectifier",
      isActive: input.isActive ?? true,
      sectionScopeIds: input.sectionScopeIds || directory.sections.map((section) => section.id)
    };
    setDirectory((prev) => ({ ...prev, users: [newUser, ...prev.users] }));
    setDataError(null);
    return true;
  }

  async function updateUser(record: User, input: UserWriteInput): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      try {
        await usersApi.update(record.id, input);
        await refreshDirectory();
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    setDirectory((prev) => ({
      ...prev,
      users: prev.users.map((user) => (user.id === record.id ? { ...user, ...input, sectionScopeIds: input.sectionScopeIds || user.sectionScopeIds } : user))
    }));
    setDataError(null);
    return true;
  }

  async function disableUser(record: User): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      try {
        await usersApi.disable(record.id);
        await refreshDirectory();
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    return updateUser(record, { isActive: false });
  }

  async function resetUserPassword(record: User, password: string): Promise<boolean> {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (!runtimeConfig.useMocks) {
      try {
        await usersApi.resetPassword(record.id, password);
        setDataError(null);
        return true;
      } catch (error) {
        setDataError(errorMessage(error));
        return false;
      }
    }
    setDataError(null);
    return true;
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
      setDirectory(emptyDirectory);
      setGalleryPhotos([]);
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (!currentPassword || !newPassword) {
      setDataError("请输入当前密码和新密码。");
      return false;
    }
    if (newPassword.length < 8) {
      setDataError("新密码至少需要 8 个字符。");
      return false;
    }
    if (runtimeConfig.useMocks) {
      setDataError(null);
      await logout();
      return true;
    }
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setDataError(null);
      await logout();
      return true;
    } catch (error) {
      setDataError(errorMessage(error));
      return false;
    }
  }

  useEffect(() => {
    if (runtimeConfig.useMocks || authStatus !== "authenticated" || !currentUser) return;
    void refreshSiteItems();
    void refreshPhotos();
    void refreshNotifications();
    void refreshDirectory();
    void refreshSystemSettings();
  }, [authStatus, currentUser?.id, refreshDirectory, refreshNotifications, refreshPhotos, refreshSiteItems, refreshSystemSettings, runtimeConfig.useMocks]);

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
      sectionSnapshot: sectionName(directory, item.sectionId),
      areaSnapshot: areaName(directory, item.areaId),
      disciplineSnapshot: disciplineName(directory, item.disciplineId),
      responsibleOrgSnapshot: organizationName(directory, item.responsibleOrgId)
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
      sectionSnapshot: sectionName(directory, item.sectionId),
      areaSnapshot: areaName(directory, item.areaId),
      disciplineSnapshot: disciplineName(directory, item.disciplineId),
      responsibleOrgSnapshot: organizationName(directory, item.responsibleOrgId)
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
    let storageProfileId = upload.storageProfileId;
    if (!objectKey) {
      if (!upload.file) throw new Error("缺少可上传的照片文件");
      const presign = await photosApi.presign({ fileName: upload.fileName, mimeType, sizeBytes });
      objectKey = presign.objectKey;
      storageProfileId = presign.storageProfileId;
      setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, objectKey, storageProfileId } : item)));
      const uploadUrl = presign.uploadUrl.startsWith("/") ? `${runtimeConfig.apiBaseUrl}${presign.uploadUrl}` : presign.uploadUrl;
      const token = readStoredToken();
      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: upload.file,
        headers: {
          "Content-Type": mimeType,
          ...(token ? { authorization: `Bearer ${token}` } : {})
        }
      });
      if (!response.ok) throw new Error("对象存储上传失败");
    }
    const completeInput: PhotoCompleteInput = { objectKey, storageProfileId, fileName: upload.fileName, mimeType, sizeBytes };
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
    changePassword,
    items,
    setItems,
    photos,
    galleryPhotos,
    photoPreviewUrls,
    logs,
    notifications,
    setNotifications,
    auditLogRecords,
    exportJobRecords,
    importJobRecords,
    directory,
    systemSettings,
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
    createExportJob,
    downloadExportJob,
    refreshExportJob,
    createImportJob,
    refreshDirectory,
    refreshSystemSettings,
    saveSystemSettings,
    createMasterData,
    updateMasterData,
    createUser,
    updateUser,
    disableUser,
    resetUserPassword,
    itemListState,
    itemDetailState,
    photoListState,
    notificationState,
    auditLogState,
    settingsState,
    directoryState,
    dataError,
    allowedActionsByItem,
    isCreatingItem,
    setIsCreatingItem,
    mobileRoute,
    setMobileRoute,
    desktopRoute,
    setDesktopRoute,
    itemCenterTab,
    setItemCenterTab,
    masterCenterTab,
    setMasterCenterTab,
    settingsCenterTab,
    setSettingsCenterTab,
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
    markAllNotificationsRead
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
        <p>{config.useMocks ? "正在进入原型模式。" : "正在恢复工作台。"}</p>
      </section>
    </main>
  );
}

function LoginPage({ state }: { state: AppState }) {
  const [selected, setSelected] = useState(users[1].id);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const isMockMode = state.runtimeConfig.useMocks;
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <span className="product-mark">POWER SITE</span>
          <h1>发电站现场管理</h1>
          <p>{isMockMode ? "尾工与缺陷闭环、现场照片和整改看板的前端原型。" : "现场尾工、缺陷和照片闭环管理。"}</p>
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
  const activeDesktopRoute = desktopNavTabs.some((tab) => tab.id === state.desktopRoute) ? state.desktopRoute : "workbench";
  return (
    <div className="app">
      <div className="mobile-shell">
        <header className="mobile-topbar">
          <div>
            <strong>现场闭环</strong>
            <span>{organizationName(state.directory, user.organizationId)}</span>
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
      {state.showNotifications ? <NotificationPanel state={state} user={user} /> : null}
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
  return <SettingsPage state={state} user={user} />;
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
  const route = allowedRoutes.includes(state.desktopRoute) ? state.desktopRoute : "workbench";
  if (route === "workbench") return <ItemCenterPage state={state} user={user} />;
  if (route === "photo") return <PhotoPage state={state} />;
  if (route === "master") return <MasterCenterPage state={state} />;
  if (route === "exports") return <ExportsPage state={state} user={user} />;
  return <SettingsCenterPage state={state} user={user} />;
}

function WorkspaceTabs<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ id: T; label: string; meta?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="workspace-tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "workspace-tab active" : "workspace-tab"}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
          {option.meta ? <small>{option.meta}</small> : null}
        </button>
      ))}
    </div>
  );
}

function ItemCenterPage({ state, user }: { state: AppState; user: User }) {
  const options: Array<{ id: ItemCenterTab; label: string; meta: string }> = [
    { id: "todo", label: "待我处理", meta: "当前角色动作" },
    { id: "items", label: "全部事项", meta: "台账与筛选" },
    { id: "dashboard", label: "统计看板", meta: "闭环概览" }
  ];
  return (
    <div className="stack workspace-page">
      <WorkspaceTabs value={state.itemCenterTab} options={options} onChange={state.setItemCenterTab} />
      {state.itemCenterTab === "todo" ? <DesktopTodo state={state} user={user} /> : null}
      {state.itemCenterTab === "items" ? <DesktopItems state={state} user={user} /> : null}
      {state.itemCenterTab === "dashboard" ? <DesktopDashboard state={state} user={user} /> : null}
    </div>
  );
}

function MasterCenterPage({ state }: { state: AppState }) {
  const options: Array<{ id: MasterCenterTab; label: string; meta: string }> = [
    { id: "directory", label: "标段区域专业", meta: "单位与基础目录" },
    { id: "users", label: "用户权限", meta: "账号和授权" }
  ];
  return (
    <div className="stack workspace-page">
      <WorkspaceTabs value={state.masterCenterTab} options={options} onChange={state.setMasterCenterTab} />
      {state.masterCenterTab === "directory" ? <MasterDataPage state={state} /> : <UsersPage state={state} />}
    </div>
  );
}

function SettingsCenterPage({ state, user }: { state: AppState; user: User }) {
  const options: Array<{ id: SettingsCenterTab; label: string; meta: string }> =
    user.role === "admin"
      ? [
          { id: "settings", label: "个人与系统", meta: "账号、密码、存储" },
          { id: "audit", label: "审计日志", meta: "操作追溯" }
        ]
      : [{ id: "settings", label: "个人设置", meta: "账号和密码" }];
  const currentTab = options.some((option) => option.id === state.settingsCenterTab) ? state.settingsCenterTab : "settings";
  return (
    <div className="stack workspace-page">
      <WorkspaceTabs value={currentTab} options={options} onChange={state.setSettingsCenterTab} />
      {currentTab === "audit" && user.role === "admin" ? <AuditPage state={state} /> : <SettingsPage state={state} user={user} />}
    </div>
  );
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
          state={state}
          item={item}
          photoCount={visiblePhotoCount(item, state.photos)}
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
      sectionName(state.directory, item.sectionId),
      areaName(state.directory, item.areaId),
      disciplineName(state.directory, item.disciplineId),
      organizationName(state.directory, item.responsibleOrgId)
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
          state={state}
          item={item}
          photoCount={visiblePhotoCount(item, state.photos)}
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

function ItemCard({ state, item, photoCount, onClick }: { state: AppState; item: SiteItem; photoCount: number; onClick: () => void }) {
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
          <div><dt>位置</dt><dd>{areaName(state.directory, item.areaId)} / {disciplineName(state.directory, item.disciplineId)}</dd></div>
          <div><dt>责任</dt><dd>{organizationName(state.directory, item.responsibleOrgId)}</dd></div>
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
                <PhotoThumb state={state} photo={photo} label="照片" onClick={() => setPreviewPhoto(photo)} />
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

function PhotoThumb({
  state,
  photo,
  label,
  onClick
}: {
  state: AppState;
  photo: PhotoAttachment;
  label: string;
  onClick: () => void;
}) {
  const previewUrl = state.photoPreviewUrls[photo.id];
  useEffect(() => {
    if (!previewUrl) void state.loadPhotoPreview(photo.id);
  }, [photo.id, previewUrl, state.loadPhotoPreview]);

  return (
    <button type="button" className="photo-thumb photo-thumb-button" onClick={onClick} aria-label={`预览 ${photo.fileName}`}>
      {previewUrl ? <img src={previewUrl} alt="" /> : <span>{label}</span>}
    </button>
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
      userName(state.directory, photo.uploadedBy),
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
              <PhotoThumb state={state} photo={photo} label="照片" onClick={() => setPreviewPhoto(photo)} />
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
      <header className="page-header item-detail-header">
        <div className="item-detail-title">
          <h1>{item.itemNo}</h1>
          <strong>{item.title}</strong>
        </div>
        <div className="page-action">
          <Button variant="ghost" onClick={() => state.setSelectedItemId(null)}>返回</Button>
        </div>
      </header>
      <div className="detail-layout">
        <div className="detail-main">
          <Card className="detail-summary-card">
            {isEditing ? (
              <ItemEditForm item={item} state={state} user={user} onCancel={() => setIsEditing(false)} onSaved={() => setIsEditing(false)} />
            ) : (
              <>
                <div className="detail-summary-top">
                  <div className="detail-head">
                    <StatusTag status={item.status} />
                    <TimingTag overdue={isOverdue(item)} dueSoon={isDueSoon(item)} />
                    <SeverityTag severity={item.severity} />
                    <span className="tag tag-neutral">{typeText[item.type]}</span>
                  </div>
                  {canEdit ? <Button variant="secondary" onClick={() => setIsEditing(true)}>编辑事项</Button> : null}
                </div>
                <div className="detail-description">
                  <span>问题描述</span>
                  <p>{item.description || "暂无描述"}</p>
                </div>
                <dl className="detail-grid detail-meta-grid">
                  <div><dt>标段</dt><dd>{sectionName(state.directory, item.sectionId)}</dd></div>
                  <div><dt>区域</dt><dd>{areaName(state.directory, item.areaId)}</dd></div>
                  <div><dt>专业</dt><dd>{disciplineName(state.directory, item.disciplineId)}</dd></div>
                  <div><dt>提出人</dt><dd>{userName(state.directory, item.createdBy)}</dd></div>
                  <div><dt>责任工程师</dt><dd>{userName(state.directory, item.ownerUserId)}</dd></div>
                  <div><dt>责任单位</dt><dd>{organizationName(state.directory, item.responsibleOrgId)}</dd></div>
                  <div><dt>责任人</dt><dd>{item.responsibleUserId ? userName(state.directory, item.responsibleUserId) : "待分配"}</dd></div>
                  <div><dt>截止</dt><dd>{formatDate(item.dueAt)}</dd></div>
                </dl>
              </>
            )}
          </Card>
          <Card className="photo-evidence-card">
            <div className="card-title-row">
              <div>
                <h3>照片证据</h3>
                <p className="muted">发现、整改、复验照片按阶段归档。</p>
              </div>
              <span className="photo-count-summary">{photosForItem.length} 张照片</span>
            </div>
            {state.itemDetailState === "loading" ? <p className="muted">正在刷新详情...</p> : null}
            {state.itemDetailState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
            <div className="photo-evidence-groups">
              {photoGroups.map((group) => (
                <div key={group.stage} className="photo-stage-group">
                  <div className="card-title-row">
                    <h4>{photoStageLabel(group.stage)}照片</h4>
                  </div>
                  <div className="photo-grid">
                    {group.photos.map((photo) => (
                      <div key={photo.id} className="photo-tile">
                        <PhotoThumb state={state} photo={photo} label={photoStageLabel(photo.stage)} onClick={() => setPreviewPhoto(photo)} />
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
          <Card className="workflow-card">
            <h3>流程处理</h3>
            <div className="workflow-action-list">
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
                            <PhotoThumb state={state} photo={photo} label="整改" onClick={() => setPreviewPhoto(photo)} />
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
                            <PhotoThumb state={state} photo={photo} label="复验" onClick={() => setPreviewPhoto(photo)} />
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
          <Card className="log-card">
            <h3>流程日志</h3>
            <ol className="timeline">
              {itemLogs(item.id, state.logs).map((log) => (
                <li key={log.id}>
                  <div className="timeline-row">
                    <strong>{actionLabel(log.action)}</strong>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <p className="timeline-comment">{log.comment || "无备注"}</p>
                  <span className="timeline-meta">{userName(state.directory, log.actorId)}</span>
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

function WorkflowOptionSelect({
  value,
  options,
  placeholder,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return undefined;
    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target instanceof Node ? event.target : null;
      if (target && !rootRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  return (
    <div className="workflow-select" ref={rootRef}>
      <button
        type="button"
        className={`input workflow-select-button ${open ? "open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={!options.length}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected?.label || placeholder}</span>
        <span aria-hidden="true">v</span>
      </button>
      {open ? (
        <div className="workflow-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`workflow-select-option ${option.value === value ? "active" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
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
    <div className="workflow-inline-form">
      <WorkflowOptionSelect
        value={organizationId}
        options={contractorOrgs.map((organization) => ({ value: organization.id, label: organization.name }))}
        placeholder="选择责任单位"
        onChange={setOrganizationId}
      />
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
    <div className="workflow-inline-form">
      <WorkflowOptionSelect
        value={userId}
        options={candidates.map((user) => ({ value: user.id, label: user.name }))}
        placeholder="选择整改人"
        onChange={setUserId}
      />
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
      <Card className="photo-gallery-card">
        <h3>照片列表</h3>
        <div className="photo-grid">
          {sortedPhotos.map((photo) => {
            const item = photo.siteItemId ? state.items.find((candidate) => candidate.id === photo.siteItemId) : undefined;
            return (
              <div key={photo.id} className="photo-tile">
                <PhotoThumb state={state} photo={photo} label={photo.stage ? photoStageLabel(photo.stage) : "照片"} onClick={() => setPreviewPhoto(photo)} />
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

function SettingsPage({ state, user }: { state: AppState; user: User }) {
  const unread = state.notifications.filter((notice) => notice.recipientId === user.id && !notice.readAt).length;
  const userDrafts = state.drafts.filter((draft) => draft.createdBy === user.id);
  return (
    <div className="stack settings-page">
      <PageHeader title="设置" meta={roleLabel(user.role)} action={<Button variant="ghost" onClick={() => void state.logout()}>退出</Button>} />
      <div className="settings-layout">
        <div className="settings-primary">
          {user.role === "admin" ? <SystemSettingsForm state={state} /> : null}
          <Card>
            <div className="card-title-row">
              <h3>修改密码</h3>
              <span className="muted">重新登录后生效</span>
            </div>
            <PasswordChangeForm state={state} />
          </Card>
        </div>
        <aside className="settings-side">
          <Card>
            <h3>个人设置</h3>
            <dl className="detail-grid settings-profile-grid">
              <div><dt>姓名</dt><dd>{user.name}</dd></div>
              <div><dt>角色</dt><dd>{roleLabel(user.role)}</dd></div>
              <div><dt>单位</dt><dd>{organizationName(state.directory, user.organizationId)}</dd></div>
              <div><dt>手机号</dt><dd>{user.phone}</dd></div>
              <div className="wide"><dt>授权标段</dt><dd>{sectionScopeText(state.directory, user)}</dd></div>
            </dl>
          </Card>
          <Card>
            <h3>工作项</h3>
            <button className="list-row" onClick={() => state.setShowNotifications(true)}>通知 <span>{unread} 未读</span></button>
            <div className="list-row">草稿 <span>{userDrafts.length} 条</span></div>
            {userDrafts.map((draft) => (
              <button key={draft.id} className="draft-row draft-button" onClick={() => state.openDraft(draft)}>
                <strong>{draft.title}</strong>
                <span>{formatDate(draft.savedAt)} · {draft.selectedPhotoIds?.length || 0} 张照片</span>
              </button>
            ))}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SystemSettingsForm({ state }: { state: AppState }) {
  const settings = state.systemSettings;
  const [profiles, setProfiles] = useState(() =>
    settings.objectStorage.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      endpoint: profile.endpoint,
      bucket: profile.bucket,
      capacityGb: bytesToGbInput(profile.capacityBytes ?? profile.usage.capacityBytes),
      accessKey: "",
      secretKey: ""
    }))
  );
  const [activeProfileId, setActiveProfileId] = useState(settings.objectStorage.activeProfileId);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.objectStorage.activeProfileId || settings.objectStorage.profiles[0]?.id || "");
  const [maxMb, setMaxMb] = useState(String(Math.round(settings.uploads.maxBytes / 1024 / 1024)));
  const [backupsManagedExternally, setBackupsManagedExternally] = useState(settings.features.backupsManagedExternally);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfiles(
      settings.objectStorage.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        endpoint: profile.endpoint,
        bucket: profile.bucket,
        capacityGb: bytesToGbInput(profile.capacityBytes ?? profile.usage.capacityBytes),
        accessKey: "",
        secretKey: ""
      }))
    );
    setActiveProfileId(settings.objectStorage.activeProfileId);
    setSelectedProfileId((current) =>
      settings.objectStorage.profiles.some((profile) => profile.id === current)
        ? current
        : settings.objectStorage.activeProfileId || settings.objectStorage.profiles[0]?.id || ""
    );
    setMaxMb(String(Math.round(settings.uploads.maxBytes / 1024 / 1024)));
    setBackupsManagedExternally(settings.features.backupsManagedExternally);
  }, [settings]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
  const selectedSavedProfile = settings.objectStorage.profiles.find((profile) => profile.id === selectedProfile?.id);

  function updateProfile(id: string, input: Partial<(typeof profiles)[number]>) {
    setProfiles((prev) => prev.map((profile) => (profile.id === id ? { ...profile, ...input } : profile)));
  }

  function addProfile() {
    const id = uniqueId("storage").replace(/[^a-zA-Z0-9_-]/g, "-");
    const next = {
      id,
      name: `存储 ${profiles.length + 1}`,
      endpoint: settings.objectStorage.endpoint || "http://minio:9000",
      bucket: settings.objectStorage.bucket || "site-management",
      capacityGb: "",
      accessKey: "",
      secretKey: ""
    };
    setProfiles((prev) => [...prev, next]);
    setSelectedProfileId(id);
  }

  function removeProfile(id: string) {
    if (profiles.length <= 1) return;
    const nextProfiles = profiles.filter((profile) => profile.id !== id);
    setProfiles(nextProfiles);
    if (selectedProfileId === id) setSelectedProfileId(nextProfiles[0]?.id || "");
    if (activeProfileId === id) setActiveProfileId(nextProfiles[0]?.id || "");
  }

  async function submit() {
    setSaved(false);
    const ok = await state.saveSystemSettings({
      objectStorage: {
        activeProfileId: activeProfileId || profiles[0]?.id,
        profiles: profiles.map(({ capacityGb, ...profile }) => ({
          ...profile,
          capacityBytes: gbInputToBytes(capacityGb)
        }))
      },
      uploads: {
        maxBytes: Math.max(1, Number(maxMb || 1)) * 1024 * 1024
      },
      features: {
        backupsManagedExternally
      }
    });
    if (ok) {
      setProfiles((prev) => prev.map((profile) => ({ ...profile, accessKey: "", secretKey: "" })));
      setSaved(true);
    }
  }

  return (
    <Card className="system-settings-card">
      <div className="card-title-row">
        <div>
          <h3>系统功能设置</h3>
          <p className="muted">管理员可维护影响全站运行的功能参数。</p>
        </div>
        {state.settingsState === "loading" ? <span className="muted">保存中...</span> : null}
      </div>
      <h4>对象存储</h4>
      {selectedSavedProfile ? (
        <div className="storage-summary-strip">
          <div>
            <span>当前启用</span>
            <strong>{settings.objectStorage.profiles.find((profile) => profile.id === activeProfileId)?.name ?? selectedSavedProfile.name}</strong>
          </div>
          <div>
            <span>容量状态</span>
            <strong>{storageUsageText(selectedSavedProfile)}</strong>
          </div>
        </div>
      ) : null}
      <div className="storage-settings-layout">
        <div className="storage-profile-panel">
          <div className="storage-panel-head">
            <div>
              <strong>存储位置</strong>
              <span>{profiles.length} 个配置</span>
            </div>
            <Button variant="secondary" onClick={addProfile}>新增</Button>
          </div>
          <div className="storage-profile-list">
          {profiles.map((profile) => {
            const savedProfile = settings.objectStorage.profiles.find((candidate) => candidate.id === profile.id);
            return (
            <button
              key={profile.id}
              type="button"
              className={`storage-profile-button ${profile.id === selectedProfileId ? "active" : ""}`}
              onClick={() => setSelectedProfileId(profile.id)}
            >
              <span>
                <strong>{profile.name}</strong>
                {profile.id === activeProfileId ? <i>当前启用</i> : null}
                {!savedProfile ? <i>未保存</i> : null}
              </span>
              <small>{profile.endpoint} / {profile.bucket}</small>
              {savedProfile ? (
                <small className={savedProfile.usage.status === "ok" ? "success-text" : "error-text"}>{storageUsageText(savedProfile)}</small>
              ) : (
                <small>保存后检测容量</small>
              )}
            </button>
            );
          })}
          </div>
        </div>
        {selectedProfile ? (
          <div className="storage-profile-editor">
            <div className="card-title-row">
              <div>
                <h4>{selectedProfile.name}</h4>
                <p className="muted">{selectedSavedProfile ? storageUsageText(selectedSavedProfile) : "保存后可检测容量"}</p>
              </div>
              <label className="checkbox-row">
                <input type="radio" checked={activeProfileId === selectedProfile.id} onChange={() => setActiveProfileId(selectedProfile.id)} />
                启用
              </label>
            </div>
            <div className="form-grid">
              <Field label="名称">
                <TextInput value={selectedProfile.name} onChange={(event) => updateProfile(selectedProfile.id, { name: event.target.value })} placeholder="例如：主 MinIO" />
              </Field>
              <Field label="对象存储地址">
                <TextInput value={selectedProfile.endpoint} onChange={(event) => updateProfile(selectedProfile.id, { endpoint: event.target.value })} placeholder="例如：http://minio:9000" />
              </Field>
              <Field label="对象存储桶">
                <TextInput value={selectedProfile.bucket} onChange={(event) => updateProfile(selectedProfile.id, { bucket: event.target.value })} placeholder="site-management" />
              </Field>
              <Field label="规划容量 GB">
                <TextInput value={selectedProfile.capacityGb} type="number" onChange={(event) => updateProfile(selectedProfile.id, { capacityGb: event.target.value })} placeholder="例如：500" />
              </Field>
              <Field label="Access Key">
                <TextInput value={selectedProfile.accessKey} onChange={(event) => updateProfile(selectedProfile.id, { accessKey: event.target.value })} placeholder={selectedSavedProfile?.accessKeyConfigured ? "已配置，留空则不修改" : "请输入 Access Key"} />
              </Field>
              <Field label="Secret Key">
                <TextInput value={selectedProfile.secretKey} type="password" onChange={(event) => updateProfile(selectedProfile.id, { secretKey: event.target.value })} placeholder={selectedSavedProfile?.secretKeyConfigured ? "已配置，留空则不修改" : "请输入 Secret Key"} />
              </Field>
            </div>
            <div className="action-row">
              <Button variant="secondary" disabled={profiles.length <= 1} onClick={() => removeProfile(selectedProfile.id)}>删除存储</Button>
            </div>
          </div>
        ) : null}
      </div>
      <h4>上传与运维</h4>
      <div className="form-grid">
        <Field label="单张照片最大上传 MB">
          <TextInput value={maxMb} type="number" onChange={(event) => setMaxMb(event.target.value)} />
        </Field>
        <label className="checkbox-row">
          <input type="checkbox" checked={backupsManagedExternally} onChange={(event) => setBackupsManagedExternally(event.target.checked)} />
          备份由服务器任务或面板统一管理
        </label>
      </div>
      <p className="muted">当前启用的对象存储会影响后续照片上传与预览。Access Key 和 Secret Key 不会在前端回显。</p>
      {saved ? <p className="success-text">设置已保存。</p> : null}
      {state.settingsState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button variant="secondary" onClick={() => void state.refreshSystemSettings()}>重新读取</Button>
        <Button disabled={state.settingsState === "loading"} onClick={() => void submit()}>保存设置</Button>
      </div>
    </Card>
  );
}

function PasswordChangeForm({ state }: { state: AppState }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (newPassword !== confirmPassword) {
      setLocalError("两次输入的新密码不一致。");
      return;
    }
    if (newPassword.length < 8) {
      setLocalError("新密码至少需要 8 个字符。");
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    const changed = await state.changePassword(currentPassword, newPassword);
    if (!changed) {
      setSubmitting(false);
    }
  }
  return (
    <div className="inline-editor password-editor">
      <div className="form-grid">
        <Field label="当前密码">
          <TextInput value={currentPassword} type="password" onChange={(event) => setCurrentPassword(event.target.value)} />
        </Field>
        <Field label="新密码">
          <TextInput value={newPassword} type="password" onChange={(event) => setNewPassword(event.target.value)} />
        </Field>
        <Field label="确认新密码">
          <TextInput value={confirmPassword} type="password" onChange={(event) => setConfirmPassword(event.target.value)} />
        </Field>
      </div>
      {localError ? <p className="error-text">{localError}</p> : null}
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button type="button" variant="secondary" disabled={submitting || !currentPassword || !newPassword || !confirmPassword} onClick={() => void submit()}>
          {submitting ? "提交中" : "确认修改"}
        </Button>
      </div>
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
  const items = scopedItems(state, user).filter((item) => item.status !== "voided").filter((item) => sectionId === "all" || item.sectionId === sectionId);
  const summary = summarize(items);
  const byArea = countBy(items, (item) => areaName(state.directory, item.areaId));
  const byOrg = countBy(items.filter(isOverdue), (item) => organizationName(state.directory, item.responsibleOrgId));
  return (
    <div className="stack">
      <PageHeader title="整改看板" meta="按标段、区域、专业、责任单位追踪闭环" />
      <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
        <option value="all">全部标段</option>
        {directorySections(state.directory).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </Select>
      <div className="desktop-metrics">
        <MetricCard label="总事项" value={summary.total} />
        <MetricCard label="打开" value={summary.open} />
        <MetricCard label="待复验" value={summary.pendingReview} tone="due" />
        <MetricCard label="超期" value={summary.overdue} tone="danger" />
        <MetricCard label="已关闭" value={summary.closed} tone="ok" />
      </div>
      <div className="two-col">
        <Card><h3>区域分布</h3>{Object.entries(byArea).map(([label, value]) => <BarRow key={label} label={label} value={value} max={Math.max(...Object.values(byArea), 1)} />)}{!Object.keys(byArea).length ? <p className="muted">暂无统计数据。</p> : null}</Card>
        <Card><h3>超期责任单位</h3>{Object.entries(byOrg).map(([label, value]) => <BarRow key={label} label={label} value={value} max={Math.max(...Object.values(byOrg), 1)} />)}{!Object.keys(byOrg).length ? <p className="muted">暂无超期事项。</p> : null}</Card>
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
      sectionName(state.directory, item.sectionId),
      areaName(state.directory, item.areaId),
      disciplineName(state.directory, item.disciplineId),
      organizationName(state.directory, item.responsibleOrgId),
      userName(state.directory, item.responsibleUserId)
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
            {canExportItemData(user) ? <Button variant="secondary" onClick={() => void state.createExportJob("excel", { itemQuery: siteItemListQuery(filters, query) })}>导出 Excel</Button> : null}
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
          options={[{ value: "all", label: "全部标段" }, ...directorySections(state.directory).map((section) => ({ value: section.id, label: section.name }))]}
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
          options={[{ value: "all", label: "全部区域" }, ...directoryAreas(state.directory).map((area) => ({ value: area.id, label: area.name }))]}
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
          options={[{ value: "all", label: "全部专业" }, ...directoryDisciplines(state.directory).map((discipline) => ({ value: discipline.id, label: discipline.name }))]}
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
            ...directoryOrganizations(state.directory).filter((organization) => organization.type === "contractor").map((organization) => ({ value: organization.id, label: organization.name }))
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
              <td>{sectionName(state.directory, item.sectionId)}</td>
              <td>{areaName(state.directory, item.areaId)} / {disciplineName(state.directory, item.disciplineId)}</td>
              <td>{organizationName(state.directory, item.responsibleOrgId)}</td>
              <td>{item.responsibleUserId ? userName(state.directory, item.responsibleUserId) : "待分配"}</td>
              <td>{formatDate(item.dueAt)}</td>
              <td>{visiblePhotoCount(item, state.photos)} 张</td>
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

function MasterDataPage({ state }: { state: AppState }) {
  const [activeKind, setActiveKind] = useState<MasterDataKind>("sections");
  const categories: Array<{ kind: MasterDataKind; title: string; description: string; records: MasterDataRecord[] }> = [
    { kind: "sections", title: "标段", description: "施工标段和合同范围", records: state.directory.sections },
    { kind: "organizations", title: "单位", description: "业主、监理、施工与其他单位", records: state.directory.organizations },
    { kind: "areas", title: "区域", description: "现场区域、系统或建筑位置", records: state.directory.areas },
    { kind: "disciplines", title: "专业", description: "土建、电气、安装等专业分类", records: state.directory.disciplines }
  ];
  const activeCategory = categories.find((category) => category.kind === activeKind) ?? categories[0];
  useEffect(() => {
    void state.refreshDirectory();
  }, [state.refreshDirectory]);
  return (
    <div className="stack">
      <PageHeader title="基础数据" meta="集中维护标段、单位、区域和专业目录" action={<Button variant="secondary" disabled>Excel 导入</Button>} />
      {state.directoryState === "loading" ? <p className="muted">正在刷新基础数据...</p> : null}
      {state.directoryState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <Card className="master-directory-card">
        <aside className="master-directory-nav" aria-label="基础数据类型">
          {categories.map((category) => (
            <button
              key={category.kind}
              type="button"
              className={category.kind === activeKind ? "active" : ""}
              onClick={() => setActiveKind(category.kind)}
            >
              <strong>{category.title}</strong>
              <span>{category.description}</span>
              <i>{category.records.length} 条</i>
            </button>
          ))}
        </aside>
        <MasterDataPanel
          key={activeCategory.kind}
          kind={activeCategory.kind}
          title={activeCategory.title}
          description={activeCategory.description}
          records={activeCategory.records}
          state={state}
        />
      </Card>
    </div>
  );
}

function MasterDataPanel({
  kind,
  title,
  description,
  records,
  state
}: {
  kind: MasterDataKind;
  title: string;
  description: string;
  records: MasterDataRecord[];
  state: AppState;
}) {
  const [editing, setEditing] = useState<MasterDataRecord | "new" | null>(null);
  return (
    <div className="master-directory-content">
      <div className="card-title-row">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description} · 共 {records.length} 条</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing("new")}>新增{title}</Button>
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
    </div>
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
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  useEffect(() => {
    void state.refreshDirectory();
  }, [state.refreshDirectory]);
  return (
    <div className="stack">
      <PageHeader title="用户与权限" meta="角色、单位、标段授权" action={<Button onClick={() => setEditing("new")}>创建用户</Button>} />
      {state.directoryState === "loading" ? <p className="muted">正在刷新用户目录...</p> : null}
      {state.directoryState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      {editing ? (
        <Card>
          <UserForm
            state={state}
            user={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />
        </Card>
      ) : null}
      {resetting ? (
        <Card>
          <PasswordResetForm
            state={state}
            user={resetting}
            onCancel={() => setResetting(null)}
            onSaved={() => setResetting(null)}
          />
        </Card>
      ) : null}
      <DataTable
        columns={["姓名", "角色", "单位", "状态", "授权标段", "操作"]}
        rows={state.directory.users.map((user) => [
          user.name,
          roleLabel(user.role),
          directoryItem(state.directory.organizations, user.organizationId)?.name || "-",
          user.isActive ? "启用" : "停用",
          user.sectionScopeIds.map((id) => directoryItem(state.directory.sections, id)?.name).join("、"),
          <div className="action-row compact-actions" key={user.id}>
            <Button variant="secondary" onClick={() => setEditing(user)}>编辑</Button>
            <Button variant="ghost" onClick={() => setResetting(user)}>重置密码</Button>
            {user.isActive && state.currentUser?.id !== user.id ? <Button variant="danger" onClick={() => state.disableUser(user)}>禁用</Button> : null}
          </div>
        ])}
      />
    </div>
  );
}

function UserForm({
  state,
  user,
  onCancel,
  onSaved
}: {
  state: AppState;
  user?: User;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [requestKey] = useState(() => uniqueId("user-create"));
  const activeOrganizations = useMemo(() => state.directory.organizations.filter((organization) => organization.isActive), [state.directory.organizations]);
  const activeSections = useMemo(() => state.directory.sections.filter((section) => section.isActive), [state.directory.sections]);
  const [values, setValues] = useState<UserWriteInput>({
    organizationId: user?.organizationId || activeOrganizations[0]?.id || "",
    name: user?.name || "",
    phone: user?.phone || "",
    username: user?.username || "",
    role: user?.role || "rectifier",
    password: "",
    isActive: user?.isActive ?? true,
    sectionScopeIds: user?.sectionScopeIds || activeSections.map((section) => section.id)
  });
  const organizationOptions = useMemo(
    () =>
      values.role === "contractor_manager" || values.role === "rectifier"
        ? activeOrganizations.filter((organization) => organization.type === "contractor")
        : activeOrganizations,
    [activeOrganizations, values.role]
  );
  useEffect(() => {
    if (organizationOptions.length && !organizationOptions.some((organization) => organization.id === values.organizationId)) {
      setValues((prev) => ({ ...prev, organizationId: organizationOptions[0].id }));
    }
  }, [organizationOptions, values.organizationId]);
  const canSave = Boolean(
    values.organizationId &&
      values.name?.trim() &&
      values.phone?.trim() &&
      values.username?.trim() &&
      values.role &&
      values.sectionScopeIds?.length &&
      (user || values.password?.trim())
  );
  function toggleSection(sectionId: string) {
    const selected = new Set(values.sectionScopeIds || []);
    if (selected.has(sectionId)) selected.delete(sectionId);
    else selected.add(sectionId);
    setValues({ ...values, sectionScopeIds: Array.from(selected) });
  }
  async function save() {
    if (!canSave) return;
    const input: UserWriteInput = {
      organizationId: values.organizationId,
      name: values.name,
      phone: values.phone,
      username: values.username,
      role: values.role,
      password: user ? undefined : values.password?.trim(),
      isActive: values.isActive,
      sectionScopeIds: values.sectionScopeIds
    };
    const saved = user
      ? await state.updateUser(user, input)
      : await state.createUser(input, requestKey);
    if (saved) onSaved();
  }
  return (
    <div className="inline-editor">
      <div className="card-title-row">
        <h3>{user ? "编辑用户" : "创建用户"}</h3>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </div>
      <div className="form-grid">
        <Field label="姓名">
          <TextInput value={values.name || ""} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        </Field>
        <Field label="手机号">
          <TextInput value={values.phone || ""} onChange={(event) => setValues({ ...values, phone: event.target.value })} />
        </Field>
        <Field label="登录名">
          <TextInput value={values.username || ""} onChange={(event) => setValues({ ...values, username: event.target.value })} />
        </Field>
        <Field label="角色">
          <Select value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value as User["role"] })}>
            <option value="admin">管理员</option>
            <option value="supervisor">业主/监理</option>
            <option value="contractor_manager">施工单位负责人</option>
            <option value="rectifier">现场整改人</option>
          </Select>
        </Field>
        <Field label="单位">
          <Select value={values.organizationId} onChange={(event) => setValues({ ...values, organizationId: event.target.value })}>
            {organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </Select>
        </Field>
        {!user ? (
          <Field label="初始密码">
            <TextInput value={values.password || ""} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="请输入初始密码" />
          </Field>
        ) : null}
        <Field label="状态">
          <Select value={values.isActive ? "active" : "inactive"} onChange={(event) => setValues({ ...values, isActive: event.target.value === "active" })}>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </Select>
        </Field>
      </div>
      <div className="section-checks">
        <strong>授权标段</strong>
        <div>
          {activeSections.map((section) => (
            <label key={section.id} className="check-pill">
              <input type="checkbox" checked={values.sectionScopeIds?.includes(section.id) || false} onChange={() => toggleSection(section.id)} />
              <span>{section.name}</span>
            </label>
          ))}
        </div>
      </div>
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!canSave} onClick={save}>保存</Button>
      </div>
    </div>
  );
}

function PasswordResetForm({ state, user, onCancel, onSaved }: { state: AppState; user: User; onCancel: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const canSave = Boolean(password.trim());
  async function save() {
    if (!canSave) return;
    const saved = await state.resetUserPassword(user, password.trim());
    if (saved) onSaved();
  }
  return (
    <div className="inline-editor">
      <div className="card-title-row">
        <h3>重置密码</h3>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
      </div>
      <p className="muted">{user.name} · 请输入新的临时密码</p>
      <Field label="新密码">
        <TextInput value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <div className="action-row">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button disabled={!canSave} onClick={save}>确认重置</Button>
      </div>
    </div>
  );
}

function ExportsPage({ state, user }: { state: AppState; user: User }) {
  const [importKind, setImportKind] = useState<ImportKind>("sections");
  const [sourceFileName, setSourceFileName] = useState("import.csv");
  const [csvText, setCsvText] = useState("name,code,isActive\n临时标段,TMP,true");
  const [pdfItemId, setPdfItemId] = useState("");
  const canImport = user.role === "admin";
  const exportableItems = scopedItems(state, user);
  const pdfTargetId = pdfItemId || exportableItems[0]?.id || "";
  async function submitImport() {
    await state.createImportJob(importKind, csvText, sourceFileName.trim() || undefined);
  }
  async function readImportFile(file?: File) {
    if (!file) return;
    setSourceFileName(file.name);
    setCsvText(await file.text());
  }
  return (
    <div className="stack">
      <PageHeader
        title="导入导出"
        meta="台账、照片包、PDF 闭环单任务"
        action={(
          <div className="action-row wrap">
            {canExportItemData(user) ? <Button onClick={() => void state.createExportJob("excel")}>导出台账</Button> : null}
            {canExportItemData(user) ? <Button variant="secondary" onClick={() => void state.createExportJob("photo_package")}>导出照片包</Button> : null}
          </div>
        )}
      />
      <Card>
        <div className="card-title-row">
          <h3>导出任务</h3>
          {state.runtimeConfig.useMocks ? <span className="muted">演示数据</span> : null}
        </div>
        <div className="form-grid">
          <Field label="PDF 闭环单事项">
            <Select value={pdfTargetId} onChange={(event) => setPdfItemId(event.target.value)}>
              {exportableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.itemNo} - {item.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="单事项导出">
            <Button variant="secondary" disabled={!pdfTargetId} onClick={() => void state.createExportJob("pdf", { itemId: pdfTargetId })}>导出 PDF 闭环单</Button>
          </Field>
        </div>
        {state.exportJobRecords.length === 0 ? <EmptyState title="暂无导出任务" description="创建台账、照片包、PDF 或审计导出后会显示在这里。" /> : null}
        {state.exportJobRecords.length > 0 ? (
          <DataTable
            columns={["任务", "类型", "状态", "发起人", "创建时间", "操作"]}
            rows={state.exportJobRecords.map((job) => [
              job.id,
              exportTypeText(job.type),
              job.status,
              userName(state.directory, job.requestedBy),
              formatDate(job.createdAt),
              <div className="action-row wrap">
                <Button variant="secondary" onClick={() => void state.refreshExportJob(job.id)}>刷新</Button>
                {job.status === "succeeded" ? <Button variant="secondary" onClick={() => void state.downloadExportJob(job.id)}>下载</Button> : null}
                {job.errorMessage ? <span className="error-text">{job.errorMessage}</span> : null}
              </div>
            ])}
          />
        ) : null}
      </Card>
      {canImport ? (
        <Card>
          <div className="card-title-row">
            <h3>导入基础数据</h3>
            <Button variant="secondary" onClick={submitImport}>提交导入</Button>
          </div>
          <div className="form-grid">
            <Field label="导入类型">
              <Select value={importKind} onChange={(event) => setImportKind(event.target.value as ImportKind)}>
                <option value="sections">标段</option>
                <option value="organizations">单位</option>
                <option value="areas">区域</option>
                <option value="disciplines">专业</option>
                <option value="users">用户</option>
              </Select>
            </Field>
            <Field label="文件名">
              <TextInput value={sourceFileName} onChange={(event) => setSourceFileName(event.target.value)} />
            </Field>
            <Field label="CSV 文件">
              <TextInput type="file" accept=".csv,text/csv" onChange={(event) => void readImportFile(event.target.files?.[0])} />
            </Field>
          </div>
          <Field label="CSV 内容">
            <TextArea value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          </Field>
        </Card>
      ) : null}
      {state.importJobRecords.length > 0 ? (
        <Card>
          <h3>导入结果</h3>
          <DataTable
            columns={["任务", "类型", "状态", "通过", "拒绝", "错误"]}
            rows={state.importJobRecords.map((job) => [
              job.id,
              importKindText(job.kind),
              job.status,
              job.acceptedRows,
              job.rejectedRows,
              job.errors.length > 0 ? job.errors.map((error) => `第 ${error.rowNumber} 行 ${error.field || ""} ${error.message}`).join("；") : job.errorMessage || "-"
            ])}
          />
        </Card>
      ) : null}
      {state.dataError ? <p className="error-text">{state.dataError}</p> : null}
    </div>
  );
}

function exportTypeText(type: ExportJob["type"]) {
  return {
    excel: "事项台账",
    photo_package: "照片包",
    pdf: "PDF 闭环单",
    audit: "审计导出"
  }[type];
}

function importKindText(kind: ImportKind) {
  return {
    sections: "标段",
    organizations: "单位",
    areas: "区域",
    disciplines: "专业",
    users: "用户"
  }[kind];
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
      <PageHeader
        title="审计日志"
        meta="按用户、时间、资源、动作筛选"
        action={<Button variant="secondary" onClick={() => void state.createExportJob("audit", { auditQuery: { resourceType: resourceType.trim() || undefined, action: action.trim() || undefined } })}>导出审计</Button>}
      />
      <div className="filter-bar">
        <TextInput placeholder="资源类型，例如 SiteItem" value={resourceType} onChange={(event) => setResourceType(event.target.value)} />
        <TextInput placeholder="动作，例如 create" value={action} onChange={(event) => setAction(event.target.value)} />
      </div>
      {state.auditLogState === "loading" ? <p className="muted">正在刷新审计日志...</p> : null}
      {state.auditLogState === "error" && state.dataError ? <p className="error-text">{state.dataError}</p> : null}
      <DataTable
        columns={["时间", "用户", "动作", "资源", "资源 ID"]}
        rows={state.auditLogRecords.map((log) => [formatDate(log.createdAt), userName(state.directory, log.actorId), log.action, log.resourceType, log.resourceId])}
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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const zoomPercent = Math.round(zoom * 100);
  const updateZoom = (nextZoom: number) => {
    setZoom(Math.min(3, Math.max(0.5, Math.round(nextZoom * 100) / 100)));
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || !frameRef.current) return;
    const frame = frameRef.current;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: frame.scrollLeft,
      scrollTop: frame.scrollTop
    };
    frame.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    const drag = dragRef.current;
    if (!drag.active || !frame) return;
    event.preventDefault();
    frame.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
    frame.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (frameRef.current?.hasPointerCapture(event.pointerId)) {
      frameRef.current.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };
  useEffect(() => {
    void state.loadPhotoPreview(photo.id);
  }, [photo.id, state.loadPhotoPreview]);
  useEffect(() => {
    setZoom(1);
    setIsDragging(false);
    dragRef.current.active = false;
  }, [photo.id]);
  useEffect(() => {
    if (zoom <= 1 && frameRef.current) {
      frameRef.current.scrollTo({ left: 0, top: 0 });
      dragRef.current.active = false;
      setIsDragging(false);
    }
  }, [zoom]);
  return (
    <div className="modal-backdrop">
      <section className="modal photo-preview-modal">
        <div className="modal-sticky-head">
          <PageHeader title="照片预览" meta={photo.fileName} action={<Button variant="ghost" onClick={onClose}>关闭</Button>} />
        </div>
        <div className="preview-toolbar">
          <Button variant="secondary" disabled={zoom <= 0.5} onClick={() => updateZoom(zoom - 0.25)}>缩小</Button>
          <span>{zoomPercent}%</span>
          <Button variant="secondary" disabled={zoom >= 3} onClick={() => updateZoom(zoom + 0.25)}>放大</Button>
          <Button variant="ghost" onClick={() => updateZoom(1)}>适屏</Button>
        </div>
        <div
          ref={frameRef}
          className={`photo-preview-frame ${zoom > 1 ? "is-zoomed" : ""} ${isDragging ? "is-dragging" : ""}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          {previewUrl ? (
            <img
              className="photo-preview-image"
              src={previewUrl}
              alt={photo.fileName}
              style={{
                width: `${zoom * 100}%`,
                maxWidth: zoom <= 1 ? "100%" : "none",
                maxHeight: zoom <= 1 ? "60vh" : "none"
              }}
            />
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
          <div><dt>上传人</dt><dd>{userName(state.directory, photo.uploadedBy)}</dd></div>
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
    return_rectification: "退回重新整改",
    close: "关闭",
    void: "作废",
    reopen: "重开",
    comment: "评论"
  };
  return labels[action];
}
