import type {
  Area,
  AuditLog,
  Discipline,
  ExportJob,
  ImportJob,
  Notification,
  Organization,
  PhotoAttachment,
  Project,
  Section,
  SiteItem,
  User,
  WorkflowLog
} from "./types";

export const project: Project = {
  id: "project-power-001",
  name: "华东沿海燃机发电站建设项目",
  code: "POWER-2026"
};

export const sections: Section[] = [
  { id: "sec-civil-a", projectId: project.id, name: "土建一标", code: "CIV-A", isActive: true },
  { id: "sec-install-b", projectId: project.id, name: "安装二标", code: "INS-B", isActive: true },
  { id: "sec-yard-c", projectId: project.id, name: "厂区配套标", code: "YARD-C", isActive: true }
];

export const organizations: Organization[] = [
  { id: "org-owner", projectId: project.id, name: "发电站项目业主工程部", type: "owner", isActive: true },
  { id: "org-supervision", projectId: project.id, name: "华能监理联合体", type: "supervisor", isActive: true },
  { id: "org-civil", projectId: project.id, name: "中建土建施工一队", type: "contractor", isActive: true },
  { id: "org-install", projectId: project.id, name: "能源安装工程公司", type: "contractor", isActive: true }
];

export const users: User[] = [
  {
    id: "u-admin",
    organizationId: "org-owner",
    name: "系统管理员",
    phone: "13800000001",
    username: "admin",
    role: "admin",
    isActive: true,
    sectionScopeIds: sections.map((section) => section.id)
  },
  {
    id: "u-supervisor",
    organizationId: "org-supervision",
    name: "监理工程师 王工",
    phone: "13800000002",
    username: "wang.supervisor",
    role: "supervisor",
    isActive: true,
    sectionScopeIds: ["sec-civil-a", "sec-install-b"]
  },
  {
    id: "u-manager-civil",
    organizationId: "org-civil",
    name: "土建负责人 李工",
    phone: "13800000003",
    username: "li.manager",
    role: "contractor_manager",
    isActive: true,
    sectionScopeIds: ["sec-civil-a"]
  },
  {
    id: "u-rectifier-civil",
    organizationId: "org-civil",
    name: "整改人 赵师傅",
    phone: "13800000004",
    username: "zhao.fix",
    role: "rectifier",
    isActive: true,
    sectionScopeIds: ["sec-civil-a"]
  },
  {
    id: "u-rectifier-install",
    organizationId: "org-install",
    name: "安装整改人 陈师傅",
    phone: "13800000005",
    username: "chen.fix",
    role: "rectifier",
    isActive: true,
    sectionScopeIds: ["sec-install-b"]
  }
];

export const areas: Area[] = [
  { id: "area-main", projectId: project.id, name: "主厂房", code: "A-MAIN", isActive: true },
  { id: "area-switchyard", projectId: project.id, name: "升压站", code: "A-SW", isActive: true },
  { id: "area-pump", projectId: project.id, name: "取水泵房", code: "A-PUMP", isActive: true },
  { id: "area-road", projectId: project.id, name: "厂区道路", code: "A-ROAD", isActive: true }
];

export const disciplines: Discipline[] = [
  { id: "disc-civil", projectId: project.id, name: "土建", code: "CIV", isActive: true },
  { id: "disc-electric", projectId: project.id, name: "电气", code: "ELE", isActive: true },
  { id: "disc-mech", projectId: project.id, name: "机务", code: "MEC", isActive: true },
  { id: "disc-install", projectId: project.id, name: "安装", code: "INS", isActive: true }
];

export const siteItems: SiteItem[] = [
  {
    id: "item-001",
    projectId: project.id,
    sectionId: "sec-civil-a",
    itemNo: "ITEM-2026-0001",
    type: "defect",
    status: "rectifying",
    severity: "important",
    title: "主厂房 A 轴柱脚混凝土蜂窝需修补",
    description: "A 轴 3-4 轴之间柱脚局部蜂窝麻面，需凿毛修补并复验。",
    areaId: "area-main",
    disciplineId: "disc-civil",
    locationText: "主厂房零米层 A 轴 3-4 轴",
    responsibleOrgId: "org-civil",
    responsibleUserId: "u-rectifier-civil",
    createdBy: "u-supervisor",
    ownerUserId: "u-supervisor",
    defaultDueAt: "2026-06-28T18:00:00Z",
    dueAt: "2026-06-28T18:00:00Z",
    createdAt: "2026-06-25T08:30:00Z",
    updatedAt: "2026-06-25T10:00:00Z"
  },
  {
    id: "item-002",
    projectId: project.id,
    sectionId: "sec-install-b",
    itemNo: "ITEM-2026-0002",
    type: "punch",
    status: "pending_acceptance",
    severity: "normal",
    title: "升压站电缆沟盖板编号缺失",
    description: "部分盖板未喷涂编号，移交前需补齐。",
    areaId: "area-switchyard",
    disciplineId: "disc-electric",
    locationText: "升压站 220kV 区电缆沟",
    responsibleOrgId: "org-install",
    responsibleUserId: "u-rectifier-install",
    createdBy: "u-supervisor",
    ownerUserId: "u-supervisor",
    defaultDueAt: "2026-06-27T18:00:00Z",
    dueAt: "2026-06-27T18:00:00Z",
    submittedForReviewAt: "2026-06-26T09:30:00Z",
    createdAt: "2026-06-24T08:30:00Z",
    updatedAt: "2026-06-26T09:30:00Z"
  },
  {
    id: "item-003",
    projectId: project.id,
    sectionId: "sec-civil-a",
    itemNo: "ITEM-2026-0003",
    type: "defect",
    status: "dispatched",
    severity: "severe",
    title: "取水泵房预留洞口临边防护缺失",
    description: "洞口周边防护不到位，需立即整改。",
    areaId: "area-pump",
    disciplineId: "disc-civil",
    locationText: "取水泵房二层平台",
    responsibleOrgId: "org-civil",
    createdBy: "u-supervisor",
    ownerUserId: "u-supervisor",
    defaultDueAt: "2026-06-25T18:00:00Z",
    dueAt: "2026-06-25T18:00:00Z",
    createdAt: "2026-06-24T12:00:00Z",
    updatedAt: "2026-06-24T12:30:00Z"
  },
  {
    id: "item-004",
    projectId: project.id,
    sectionId: "sec-yard-c",
    itemNo: "ITEM-2026-0004",
    type: "punch",
    status: "closed",
    severity: "normal",
    title: "厂区道路雨水篦子清理完成",
    description: "移交前清理雨水口杂物。",
    areaId: "area-road",
    disciplineId: "disc-civil",
    locationText: "厂区南侧道路 K0+240",
    responsibleOrgId: "org-civil",
    responsibleUserId: "u-rectifier-civil",
    createdBy: "u-supervisor",
    ownerUserId: "u-supervisor",
    defaultDueAt: "2026-06-26T18:00:00Z",
    dueAt: "2026-06-26T18:00:00Z",
    closedAt: "2026-06-26T10:00:00Z",
    createdAt: "2026-06-22T08:30:00Z",
    updatedAt: "2026-06-26T10:00:00Z"
  }
];

export const photos: PhotoAttachment[] = [
  {
    id: "photo-001",
    siteItemId: "item-001",
    stage: "discovery",
    thumbnailKey: "thumbs/item-001-discovery.jpg",
    fileName: "蜂窝麻面-发现.jpg",
    uploadedBy: "u-supervisor",
    uploadedAt: "2026-06-25T08:32:00Z",
    sectionSnapshot: "土建一标",
    areaSnapshot: "主厂房",
    disciplineSnapshot: "土建",
    responsibleOrgSnapshot: "中建土建施工一队"
  },
  {
    id: "photo-002",
    siteItemId: "item-002",
    stage: "rectification",
    thumbnailKey: "thumbs/item-002-fix.jpg",
    fileName: "盖板编号-整改.jpg",
    uploadedBy: "u-rectifier-install",
    uploadedAt: "2026-06-26T09:25:00Z",
    sectionSnapshot: "安装二标",
    areaSnapshot: "升压站",
    disciplineSnapshot: "电气",
    responsibleOrgSnapshot: "能源安装工程公司"
  }
];

export const workflowLogs: WorkflowLog[] = [
  { id: "log-001", siteItemId: "item-001", action: "create", toStatus: "pending_approval", comment: "监理提交待审核缺陷", actorId: "u-supervisor", createdAt: "2026-06-25T08:30:00Z" },
  { id: "log-002", siteItemId: "item-001", action: "dispatch", fromStatus: "pending_approval", toStatus: "dispatched", comment: "责任工程师派发给土建施工一队", actorId: "u-supervisor", createdAt: "2026-06-25T09:00:00Z" },
  { id: "log-003", siteItemId: "item-001", action: "start_rectify", fromStatus: "dispatched", toStatus: "rectifying", comment: "整改人已接收", actorId: "u-rectifier-civil", createdAt: "2026-06-25T10:00:00Z" },
  { id: "log-004", siteItemId: "item-002", action: "submit_review", fromStatus: "rectifying", toStatus: "pending_acceptance", comment: "编号已补喷，请复验", actorId: "u-rectifier-install", createdAt: "2026-06-26T09:30:00Z" }
];

export const notifications: Notification[] = [
  { id: "nt-001", recipientId: "u-rectifier-civil", siteItemId: "item-001", type: "assigned", title: "新的整改任务", content: "主厂房 A 轴柱脚混凝土蜂窝需修补", createdAt: "2026-06-25T09:00:00Z" },
  { id: "nt-002", recipientId: "u-supervisor", siteItemId: "item-002", type: "review_requested", title: "待复验事项", content: "升压站电缆沟盖板编号缺失已提交复验", createdAt: "2026-06-26T09:30:00Z" },
  { id: "nt-003", recipientId: "u-manager-civil", siteItemId: "item-003", type: "overdue", title: "事项已超期", content: "取水泵房预留洞口临边防护缺失已超期", createdAt: "2026-06-26T08:00:00Z" }
];

export const exportJobs: ExportJob[] = [
  {
    id: "ex-001",
    type: "excel",
    status: "succeeded",
    requestedBy: "u-admin",
    params: { status: "open" },
    artifactKey: "exports/site-items-20260626.csv",
    artifactFileName: "site-items-20260626.csv",
    artifactMimeType: "text/csv; charset=utf-8",
    createdAt: "2026-06-26T08:20:00Z",
    startedAt: "2026-06-26T08:20:01Z",
    completedAt: "2026-06-26T08:20:02Z"
  },
  { id: "ex-002", type: "photo_package", status: "running", requestedBy: "u-supervisor", createdAt: "2026-06-26T10:20:00Z", startedAt: "2026-06-26T10:20:01Z" }
];

export const importJobs: ImportJob[] = [
  {
    id: "im-001",
    kind: "users",
    status: "succeeded",
    requestedBy: "u-admin",
    sourceFileName: "users-seed.csv",
    acceptedRows: 1,
    rejectedRows: 0,
    errors: [],
    createdAt: "2026-06-26T09:20:00Z",
    startedAt: "2026-06-26T09:20:01Z",
    completedAt: "2026-06-26T09:20:02Z"
  }
];

export const auditLogs: AuditLog[] = [
  { id: "audit-001", actorId: "u-supervisor", action: "site_item.create", resourceType: "SiteItem", resourceId: "item-001", createdAt: "2026-06-25T08:30:00Z" },
  { id: "audit-002", actorId: "u-supervisor", action: "site_item.dispatch", resourceType: "SiteItem", resourceId: "item-001", createdAt: "2026-06-25T09:00:00Z" }
];
