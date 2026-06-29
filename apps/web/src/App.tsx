import { useEffect, useMemo, useRef, useState } from "react";
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
  DraftItem,
  Notification,
  PhotoAttachment,
  PhotoStage,
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
type FilterSelectOption = { value: string; label: string };
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SiteItem[]>(siteItems);
  const [photos, setPhotos] = useState<PhotoAttachment[]>(initialPhotos);
  const [logs, setLogs] = useState<WorkflowLog[]>(initialWorkflowLogs);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeDraft, setActiveDraft] = useState<DraftItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [mobileRoute, setMobileRoute] = useState<MobileRoute>("todo");
  const [desktopRoute, setDesktopRoute] = useState<DesktopRoute>("dashboard");
  const [showNotifications, setShowNotifications] = useState(false);
  const idempotencyKeys = useRef(new Set<string>());

  const currentUser = currentUserId ? users.find((user) => user.id === currentUserId) ?? null : null;

  function runOnce(key: string, action: () => void) {
    if (idempotencyGuard(idempotencyKeys.current, key)) action();
  }

  function createItemFromForm(values: Partial<SiteItem>, options: CreateItemOptions) {
    if (!currentUser || !canCreateItem(currentUser)) return;
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
      setSelectedItemId(newItem.id);
      setActiveDraft(null);
      setIsCreatingItem(false);
      setMobileRoute("items");
    });
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

  function applyWorkflow(item: SiteItem, action: WorkflowAction, options?: { userId?: string; organizationId?: string; comment?: string }) {
    if (!currentUser) return;
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
    const newUpload: UploadQueueItem = {
      id: `upload-${Date.now()}`,
      fileName: `现场照片-${uploadQueue.length + 1}.jpg`,
      stage,
      state: "pending",
      uploadedBy: currentUser.id
    };
    setUploadQueue((prev) => [newUpload, ...prev]);
  }

  function completeUpload(upload: UploadQueueItem) {
    if (!currentUser) {
      setUploadQueue((prev) => prev.map((item) => (item.id === upload.id ? { ...item, state: "failed" } : item)));
      return;
    }
    const item = upload.siteItemId ? items.find((candidate) => candidate.id === upload.siteItemId) : undefined;
    runOnce(`photo-complete-${upload.id}`, () => {
      setPhotos((prev) => [buildPhoto(upload, item), ...prev]);
      setUploadQueue((prev) => prev.map((queueItem) => (queueItem.id === upload.id ? { ...queueItem, state: "complete" } : queueItem)));
    });
  }

  return {
    currentUser,
    currentUserId,
    setCurrentUserId,
    items,
    setItems,
    photos,
    logs,
    notifications,
    setNotifications,
    drafts,
    setDrafts,
    activeDraft,
    setActiveDraft,
    uploadQueue,
    setUploadQueue,
    selectedItemId,
    setSelectedItemId,
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
    saveDraft,
    applyWorkflow,
    bindPhotosToItem,
    addMockUpload,
    completeUpload
  };
}

export function App() {
  const state = useAppState();
  if (!state.currentUser) return <LoginPage onLogin={state.setCurrentUserId} />;
  return <Shell state={state} user={state.currentUser} />;
}

type AppState = ReturnType<typeof useAppState>;

function LoginPage({ onLogin }: { onLogin: (id: string) => void }) {
  const [selected, setSelected] = useState(users[1].id);
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <span className="product-mark">POWER SITE</span>
          <h1>发电站现场管理</h1>
          <p>尾工与缺陷闭环、现场照片和整改看板的前端原型。</p>
        </div>
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
        <Button onClick={() => onLogin(selected)}>登录原型</Button>
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
  if (route === "drawings") return <DrawingAdmin />;
  if (route === "master") return <MasterDataPage />;
  if (route === "users") return <UsersPage />;
  if (route === "exports") return <ExportsPage />;
  if (route === "profile") return <ProfilePage state={state} user={user} />;
  return <AuditPage />;
}

function TodoPage({ state, user }: { state: AppState; user: User }) {
  const items = visibleItems(user, state.items);
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
  const base = defaultListItems(user, state.items);
  const filtered = base.filter((item) => {
    const text = [
      item.itemNo,
      item.title,
      getSection(item.sectionId)?.name,
      getArea(item.areaId)?.name,
      getDiscipline(item.disciplineId)?.name,
      getOrganization(item.responsibleOrgId)?.name
    ].join("");
    return matchesItemFilter(filters, item, user) && text.includes(query);
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

function matchesItemFilter(filters: ItemFilterValues, item: SiteItem, user: User) {
  if (filters.status === "open" && ["closed", "voided"].includes(item.status)) return false;
  if (filters.status === "mine" && !allowedActions(user, item).some((action) => action !== "comment")) return false;
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
  const scopedSections = sections.filter((section) => currentUser?.sectionScopeIds.includes(section.id));
  const initialSectionId = draftValues?.sectionId || scopedSections[0]?.id || sections[0].id;
  const initialOwnerCandidates = ownerCandidatesForSection(initialSectionId);
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
    areaId: areas[0].id,
    disciplineId: disciplines[0].id,
    ownerUserId: defaultOwnerId,
    title: "",
    description: "",
    locationText: "",
    dueAt: defaultDueAt(),
    ...draftValues
  });
  const ownerCandidates = ownerCandidatesForSection(values.sectionId);
  const availablePhotos = state.photos
    .filter((photo) => !photo.siteItemId && photo.uploadedBy === currentUser?.id)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const selectedPhotos = availablePhotos.filter((photo) => selectedPhotoIds.includes(photo.id));
  function changeArea(areaId: string) {
    setValues({ ...values, areaId });
  }
  function togglePhoto(photoId: string) {
    setSelectedPhotoIds((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
  }
  if (isPickingPhotos) {
    return (
      <PhotoPickerPage
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
                const candidates = ownerCandidatesForSection(sectionId);
                const ownerStillValid = candidates.some((candidate) => candidate.id === values.ownerUserId);
                setValues({ ...values, sectionId, ownerUserId: ownerStillValid ? values.ownerUserId : candidates[0]?.id });
              }}
            >
              {scopedSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </Select>
          </Field>
          <Field label="区域">
            <Select value={values.areaId} onChange={(event) => changeArea(event.target.value)}>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </Select>
          </Field>
          <Field label="专业">
            <Select value={values.disciplineId} onChange={(event) => setValues({ ...values, disciplineId: event.target.value })}>
              {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
            </Select>
          </Field>
          <Field label="责任工程师">
            <Select value={values.ownerUserId} onChange={(event) => setValues({ ...values, ownerUserId: event.target.value })}>
              {ownerCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </Select>
          </Field>
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
      <div className="action-row sticky-actions">
        <Button variant="secondary" onClick={() => state.saveDraft(values, selectedPhotoIds)}>保存草稿</Button>
        <Button onClick={() => state.createItemFromForm(values, { requestKey, selectedPhotoIds })}>提交审核</Button>
      </div>
      {previewPhoto ? <PhotoPreviewModal photo={previewPhoto} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function PhotoPickerPage({
  title,
  photos,
  selectedPhotoIds,
  onToggle,
  onCancel,
  onConfirm
}: {
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
      {previewPhoto ? <PhotoPreviewModal photo={previewPhoto} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function ItemDetailPage({ state, user, item }: { state: AppState; user: User; item: SiteItem }) {
  const actions = allowedActions(user, item);
  const canComment = actions.includes("comment");
  const workflowActions = actions.filter((action) => action !== "comment");
  const [selectedReviewPhotoIds, setSelectedReviewPhotoIds] = useState<string[]>([]);
  const [isPickingReviewPhotos, setIsPickingReviewPhotos] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoAttachment | null>(null);
  const availableReviewPhotos = state.photos
    .filter((photo) => !photo.siteItemId && photo.uploadedBy === user.id)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const selectedReviewPhotos = availableReviewPhotos.filter((photo) => selectedReviewPhotoIds.includes(photo.id));
  const photosForItem = itemPhotos(item.id, state.photos);
  const photoStages: PhotoStage[] = ["discovery", "rectification", "review"];
  const photoGroups = photoStages
    .map((stage) => ({ stage, photos: photosForItem.filter((photo) => photo.stage === stage) }))
    .filter((group) => group.photos.length);
  function toggleReviewPhoto(photoId: string) {
    setSelectedReviewPhotoIds((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
  }
  function submitReviewWithPhotos() {
    state.bindPhotosToItem(item, selectedReviewPhotoIds, "rectification");
    state.applyWorkflow(item, "submit_review", {
      comment: selectedReviewPhotoIds.length
        ? `整改人提交复验，已绑定${selectedReviewPhotoIds.length}张整改照片`
        : "整改人提交复验"
    });
    setSelectedReviewPhotoIds([]);
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
        title="选择整改照片"
        photos={availableReviewPhotos}
        selectedPhotoIds={selectedReviewPhotoIds}
        onToggle={toggleReviewPhoto}
        onCancel={() => setIsPickingReviewPhotos(false)}
        onConfirm={() => setIsPickingReviewPhotos(false)}
      />
    );
  }
  return (
    <div className="stack item-detail-page">
      <PageHeader title={item.itemNo} meta={item.title} action={<Button variant="ghost" onClick={() => state.setSelectedItemId(null)}>返回</Button>} />
      <div className="detail-layout">
        <div className="detail-main">
          <Card className="detail-summary-card">
            <div className="detail-head">
              <StatusTag status={item.status} />
              <TimingTag overdue={isOverdue(item)} dueSoon={isDueSoon(item)} />
              <SeverityTag severity={item.severity} />
              <span>{typeText[item.type]}</span>
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
          </Card>
          <Card className="photo-evidence-card">
            <h3>照片证据</h3>
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
      {previewPhoto ? <PhotoPreviewModal photo={previewPhoto} item={item} onClose={() => setPreviewPhoto(null)} /> : null}
    </div>
  );
}

function DispatchItem({ item, state }: { item: SiteItem; state: AppState }) {
  const contractorOrgs = organizations.filter((organization) => organization.type === "contractor" && organization.isActive);
  const [organizationId, setOrganizationId] = useState(item.responsibleOrgId || contractorOrgs[0]?.id || "");
  const organizationName = getOrganization(organizationId)?.name || "责任单位";
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
  const candidates = activeRectifiersForOrg(item.responsibleOrgId || "", item.sectionId);
  const [userId, setUserId] = useState(candidates[0]?.id || "");
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
  const visibleUploads = state.uploadQueue.filter((upload) => upload.state !== "complete" && upload.uploadedBy === currentUserId);
  const sortedPhotos = state.photos
    .filter((photo) => photo.uploadedBy === currentUserId)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  return (
    <div className="stack">
      <PageHeader title="我的现场图库" meta="当前账号独立管理，后续在事项表单中绑定" action={<Button onClick={() => state.addMockUpload()}>添加照片</Button>} />
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
                <Button variant="secondary" onClick={() => setPreviewPhoto(photo)}>预览</Button>
              </div>
            );
          })}
        </div>
        {!sortedPhotos.length ? <EmptyState title="暂无照片" description="点击添加照片，将现场照片先上传到图库。" /> : null}
      </Card>
      {previewPhoto ? (
        <PhotoPreviewModal
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
  const source = visibleItems(user, state.items).filter((item) => sectionId === "all" || item.sectionId === sectionId);
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
      <PageHeader title="我的" meta={roleLabel(user.role)} action={<Button variant="ghost" onClick={() => state.setCurrentUserId(null)}>退出</Button>} />
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
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <PageHeader title="通知" action={<Button variant="ghost" onClick={() => state.setShowNotifications(false)}>关闭</Button>} />
        {notices.map((notice) => (
          <button
            key={notice.id}
            className={`notice ${notice.readAt ? "" : "unread"}`}
            onClick={() => state.setNotifications((prev) => prev.map((item) => (item.id === notice.id ? { ...item, readAt: new Date().toISOString() } : item)))}
          >
            <strong>{notice.title}</strong>
            <span>{notice.content}</span>
            <small>{formatDate(notice.createdAt)}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function DesktopTodo({ state, user }: { state: AppState; user: User }) {
  const visible = visibleItems(user, state.items);
  const actionable = visible.filter((item) => allowedActions(user, item).some((action) => action !== "comment"));
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
  const items = visibleItems(user, state.items).filter((item) => sectionId === "all" || item.sectionId === sectionId);
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
  const items = visibleItems(user, state.items).filter((item) => {
    const text = [
      item.itemNo,
      item.title,
      getSection(item.sectionId)?.name,
      getArea(item.areaId)?.name,
      getDiscipline(item.disciplineId)?.name,
      getOrganization(item.responsibleOrgId)?.name,
      getUser(item.responsibleUserId)?.name
    ].join("");
    return matchesItemFilter(filters, item, user) && text.includes(query);
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

function DrawingAdmin() {
  return (
    <div className="stack">
      <PageHeader title="图纸管理" meta="区域图纸、版本和预览入口" action={<Button>上传图纸</Button>} />
      {drawings.map((drawing) => (
        <Card key={drawing.id}>
          <h3>{drawing.name}</h3>
          <p className="muted">{drawing.code} · {getArea(drawing.areaId)?.name}</p>
          <DataTable
            columns={["版本", "页数", "当前", "上传时间", "预览"]}
            rows={drawing.revisions.map((revision) => [revision.revisionNo, String(revision.pageCount), revision.isCurrent ? "是" : "否", formatDate(revision.uploadedAt), revision.coverPreviewKey])}
          />
        </Card>
      ))}
    </div>
  );
}

function MasterDataPage() {
  return (
    <div className="stack">
      <PageHeader title="基础数据" meta="标段、单位、区域、专业" action={<Button>Excel 导入</Button>} />
      <div className="two-col">
        <MasterList title="标段" rows={sections.map((item) => [item.code, item.name])} />
        <MasterList title="单位" rows={organizations.map((item) => [item.type, item.name])} />
        <MasterList title="区域" rows={areas.map((item) => [item.code, item.name])} />
        <MasterList title="专业" rows={disciplines.map((item) => [item.code, item.name])} />
      </div>
    </div>
  );
}

function UsersPage() {
  return (
    <div className="stack">
      <PageHeader title="用户与权限" meta="角色、单位、标段授权" action={<Button>创建用户</Button>} />
      <DataTable
        columns={["姓名", "角色", "单位", "状态", "授权标段"]}
        rows={users.map((user) => [
          user.name,
          roleLabel(user.role),
          getOrganization(user.organizationId)?.name || "-",
          user.isActive ? "启用" : "停用",
          user.sectionScopeIds.map((id) => getSection(id)?.name).join("、")
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

function AuditPage() {
  return (
    <div className="stack">
      <PageHeader title="审计日志" meta="按用户、时间、资源、动作筛选" action={<Button variant="secondary">导出审计</Button>} />
      <DataTable
        columns={["时间", "用户", "动作", "资源", "资源 ID"]}
        rows={auditLogs.map((log) => [formatDate(log.createdAt), getUser(log.actorId)?.name || "-", log.action, log.resourceType, log.resourceId])}
      />
    </div>
  );
}

function MasterList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <Card>
      <h3>{title}</h3>
      <DataTable columns={["编码/类型", "名称"]} rows={rows} />
    </Card>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
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

function PhotoPreviewModal({ photo, item, onClose }: { photo: PhotoAttachment; item?: SiteItem; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal photo-preview-modal">
        <PageHeader title="照片预览" meta={photo.fileName} action={<Button variant="ghost" onClick={onClose}>关闭</Button>} />
        <div className="photo-preview-frame">
          <span>{photoStageLabel(photo.stage)}</span>
          <strong>{photo.fileName}</strong>
        </div>
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
