# 发电站现场尾工与缺陷闭环管理网站 v1 开发文档

## 1. 项目概述

本项目面向发电站建设现场，建设一个手机优先的尾工与缺陷闭环管理网站。系统用于支撑现场人员发现问题、拍照取证、派发整改、复验关闭、归档移交，并为管理层提供整改看板和追踪依据。

首版目标不是做“大而全”的工程平台，而是优先让现场闭环真实跑通：

1. 现场人员能用手机快速新建缺陷或尾工事项。
2. 事项能按标段、区域、专业、责任单位派发。
3. 整改人能上传整改照片并提交复验。
4. 业主或监理能复验关闭、作废或重开事项。
5. 管理层能看到状态、超期、责任单位、区域和专业维度的统计。
6. 资料人员能导出 Excel 台账、照片包和单事项 PDF 闭环单。

## 2. 范围与边界

### 2.1 首版包含

- 单项目多标段管理。
- 尾工和缺陷统一事项模型。
- 标准闭环流程：待审核、已派发、整改中、待复验、已关闭。
- 异常流程：作废、关闭后重开。
- 四类角色权限：管理员、业主/监理、施工单位负责人、现场整改人。
- 区域、专业和文字位置定位。
- 现场照片上传、缩略图、预览、元数据记录、失败重试。
- 站内通知和固定超期提醒。
- 整改看板。
- Excel 台账、照片包、PDF 闭环单导出。
- 基础数据后台维护和 Excel 批量导入。
- 操作日志、审计查询、每日数据库备份和对象存储备份。

### 2.2 首版不包含

- 企业微信、钉钉、短信、邮件等外部通知。
- BIM、CAD/DWG 解析或外部系统集成。
- 完整离线同步。
- 手写签名、电子印章、复杂审批流。
- 强防篡改审计、导出审批和访问水印。
- 深色指挥中心大屏。
- 可配置催办规则和复杂 SLA 策略。

## 3. 技术方案

### 3.1 技术栈

- 前端：React、TypeScript、Vite。
- UI 风格：IBM Carbon 设计语言方向，自定义工程项目主题。
- 后端：Node.js、TypeScript、NestJS 或 Fastify。
- 数据库：PostgreSQL。
- ORM：Prisma。
- 对象存储：MinIO，使用 S3 兼容接口。
- 缓存与任务：Redis + BullMQ，处理导出、缩略图、提醒任务。
- 文件处理：Sharp 生成照片缩略图，PDF 渲染/预览使用服务端转换或前端 PDF.js。
- 部署：项目内网服务器，Docker Compose 管理 PostgreSQL、MinIO、Redis、API、Web。

### 3.2 推荐目录结构

```text
apps/
  web/                 # React 前端
  api/                 # Node.js API
packages/
  shared/              # 共享类型、枚举、校验规则
infra/
  docker-compose.yml
  nginx/
docs/
  site-management-v1-dev.md
```

## 4. UI 设计规范

### 4.1 整体风格

采用 IBM / Carbon 风格作为基准：浅色、方正、克制、数据密集、工程专业。界面应服务现场效率，不做营销式首页、大面积装饰图或强视觉背景。

设计关键词：

- 工程专业。
- 手机优先。
- 紧凑实用。
- 状态明确。
- 少阴影、少渐变、少装饰。
- 通过边线、灰阶、状态色和排版建立层级。

### 4.2 色彩

| 用途 | 颜色 | 建议值 |
| --- | --- | --- |
| 主色/进行中 | IBM Blue | `#0f62fe` |
| 页面背景 | 浅灰 | `#f4f4f4` |
| 卡片背景 | 白色 | `#ffffff` |
| 主文字 | 近黑 | `#161616` |
| 次级文字 | 深灰 | `#525252` |
| 边框 | 浅灰 | `#e0e0e0` |
| 已关闭 | 绿色 | `#24a148` |
| 待复验/临期 | 橙色 | `#f1c21b` |
| 超期/严重 | 红色 | `#da1e28` |
| 作废 | 灰色 | `#8d8d8d` |

### 4.3 字体与密度

- 中文字体：系统默认字体，优先 `PingFang SC`、`Microsoft YaHei`、`Noto Sans SC`。
- 英文和数字：可使用 `IBM Plex Sans`。
- 移动端卡片信息密度偏紧凑，同屏应尽量展示更多待办。
- 按钮、标签、表格、筛选项必须避免文字溢出。

### 4.4 手机端导航

底部五个固定入口：

1. 待办：我的待整改、待复验、临期、超期。
2. 事项：全部事项列表和筛选。
3. 拍照：现场图库，先拍照上传，后在事项表单中绑定。
4. 设置：个人信息、通知、草稿、密码和可用系统设置。

### 4.5 桌面端布局

桌面端用于后台配置、看板、批量导入和归档导出。布局采用左侧导航 + 内容区，避免重复入口：

- 事项中心：页内包含 `待我处理`、`全部事项`、`统计看板`。
- 现场图库：个人图库、上传队列、照片预览与删除。
- 基础数据：页内包含 `标段区域专业`、`用户权限`。
- 导入导出：基础数据导入、事项台账/照片包/PDF/审计导出任务。
- 系统设置：页内包含 `个人与系统`、`审计日志`；非管理员只显示个人设置能力。

## 5. 角色与权限

### 5.1 角色定义

| 角色 | 主要职责 |
| --- | --- |
| 管理员 | 系统配置、用户管理、基础数据、导入导出、审计、备份检查 |
| 业主/监理 | 新建事项、派发、复验、关闭、作废、重开、查看看板 |
| 施工单位负责人 | 接收派发、分配整改人、查看本单位事项、催办本单位人员 |
| 现场整改人 | 查看分配给自己的事项、提交整改说明和整改照片 |

### 5.2 权限原则

- 管理员可查看和维护全部项目数据。
- 业主/监理可查看授权标段内全部事项，可派发、复验、关闭、作废和重开。
- 施工单位负责人只能查看本单位或被派发给本单位的事项。
- 现场整改人只能查看分配给自己的事项，不能关闭事项。
- 操作日志和审计日志只能新增，普通用户不可删除。
- 导出功能默认仅管理员、业主/监理、施工单位负责人可用，导出范围受数据权限限制。
- 用户可访问标段必须通过 `UserSectionScope` 显式维护；事项列表、事项详情、看板、导出、审计查询都必须在服务端按授权标段过滤。

## 6. 业务流程

### 6.1 主流程

```text
待审核
  -> 派发责任单位和责任人
已派发
  -> 责任人查看并开始处理
整改中
  -> 上传整改说明和照片
待复验
  -> 业主/监理复验
已关闭
```

### 6.2 作废流程

适用于误提、重复事项、不属于本项目范围等情况。

- 允许角色：管理员、业主/监理。
- 允许状态：除已关闭外的所有状态。
- 必填信息：作废原因。
- 系统行为：状态变为作废，记录 WorkflowLog 和 AuditLog，事项不进入待办但仍可查询和导出。

### 6.3 重开流程

适用于关闭后复查发现整改不到位或同一问题复发。

- 允许角色：管理员、业主/监理。
- 允许状态：已关闭。
- 必填信息：重开原因。
- 系统行为：若原责任单位和责任人仍有效，状态回到整改中；若原责任人已停用或责任单位已停用，状态回到已派发并要求重新分配责任人。重开必须记录日志、生成重开通知，并重新进入待办和超期计算。

## 7. 事项规则

### 7.1 事项类型

- 缺陷：质量问题、安全隐患、施工偏差、成品损坏等。
- 尾工：未完成小项、收尾工作、移交前补项等。

### 7.2 严重等级与期限

| 等级 | 默认整改期限 | 说明 |
| --- | --- | --- |
| 一般 | 7 天 | 普通质量问题或一般尾工 |
| 重要 | 3 天 | 影响后续工序、验收或局部安全 |
| 严重 | 1 天 | 明显安全隐患、关键质量风险或严重影响节点 |

创建人可以调整截止时间，但系统必须保留等级默认期限和人工调整后的最终期限。若创建人未调整期限，默认截止时间与最终截止时间一致；若调整期限，必须记录调整人、调整时间和调整原因。

### 7.3 超期规则

- 当前时间晚于截止时间且事项未关闭、未作废，即为超期。
- 到期前 1 天生成临期提醒。
- 超期当天生成超期提醒。
- 重开事项重新参与超期计算。重开时若保留原最终截止时间且已经超期，系统立即标记超期；若复验人填写新的截止时间，必须记录期限调整信息。

## 9. 照片管理

### 9.1 照片来源

- 拍照入口先上传到现场图库，默认未绑定事项。
- 现场图库按上传人隔离，普通用户只看到自己上传的照片。
- 新建事项时进入图库选择模式，选择发现照片，确认后返回表单并在提交时绑定。
- 整改提交时进入图库选择模式，选择整改照片，确认后返回表单并在提交时绑定。
- 复验关闭时进入图库选择模式，选择复验照片，确认后返回表单并在关闭时绑定。

### 9.2 元数据

每张照片至少记录：

- 关联事项，可为空；未绑定照片保留在现场图库。
- 上传人。
- 上传时间。
- 原始文件名。
- 文件大小。
- MIME 类型。
- 原图对象存储 Key。
- 缩略图对象存储 Key。
- 照片阶段：发现、整改、复验；未绑定时可为空。
- 区域、专业、标段、责任单位快照；绑定事项后写入。

### 9.3 上传策略

- 前端先本地压缩预览，后端保存原图和缩略图。
- 上传失败时保留本地待上传记录，允许重试。
- 表单选择照片时进入图库选择模式，不在表单内全量展示图库；选择模式必须支持搜索，并限制默认展示最近照片数量。
- 单张照片建议限制 10MB。
- 单事项首版建议最多 30 张照片。
- 对象存储 Key 使用不可猜测路径，不直接暴露内部路径。

## 10. 通知催办

### 10.1 通知类型

- 新事项派发通知。
- 整改人分配通知。
- 待复验通知。
- 到期前 1 天临期提醒。
- 超期提醒。
- 作废通知。
- 重开通知。

### 10.2 站内通知

通知在系统内展示：

- 手机端底部导航红点。
- 待办页通知入口。
- 我的页面通知列表。
- 桌面端顶部通知入口。

### 10.3 固定提醒规则

- 到期前 1 天提醒责任人。
- 超期当天提醒责任人和施工单位负责人。
- 同一事项同一提醒类型每天最多生成一次。

## 11. 归档与导出

### 11.1 Excel 台账

导出字段包括：

- 事项编号。
- 事项类型。
- 状态。
- 严重等级。
- 标题。
- 描述。
- 标段。
- 区域。
- 专业。
- 责任单位。
- 责任人。
- 创建人。
- 创建时间。
- 截止时间。
- 整改提交时间。
- 关闭时间。
- 是否超期。
- 照片数量。
- 最新处理意见。

### 11.2 照片包

照片包按事项编号分目录：

```text
export/
  ITEMS-2026-0001/
    发现-001.jpg
    整改-001.jpg
    复验-001.jpg
  ITEMS-2026-0002/
    发现-001.jpg
```

照片包中应包含一个 `manifest.xlsx` 或 `manifest.json`，记录照片和事项的对应关系。

### 11.3 PDF 闭环单

单事项 PDF 包含：

- 项目名称。
- 标段、区域、专业。
- 事项编号、类型、等级、状态。
- 问题描述。
- 发现照片、整改照片、复验照片。
- 责任单位和责任人。
- 流程日志。
- 创建、派发、整改、复验、关闭人员和时间。

签认依据采用系统操作留痕，不做手写签名和电子章。

## 12. 数据模型

### 12.1 Project

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| name | string | 项目名称 |
| code | string | 项目编码 |
| status | enum | active, archived |
| createdAt | datetime | 创建时间 |

### 12.2 Section

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| projectId | uuid | 所属项目 |
| name | string | 标段名称 |
| code | string | 标段编码 |
| isActive | boolean | 是否启用 |

### 12.3 Organization

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| projectId | uuid | 所属项目 |
| name | string | 单位名称 |
| type | enum | owner, supervisor, contractor, other |
| contactName | string | 联系人 |
| contactPhone | string | 联系电话 |
| isActive | boolean | 是否启用 |

### 12.4 User

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| organizationId | uuid | 所属单位 |
| name | string | 姓名 |
| phone | string | 手机号 |
| username | string | 登录名 |
| passwordHash | string | 密码哈希 |
| role | enum | admin, supervisor, contractor_manager, rectifier |
| isActive | boolean | 是否启用 |
| lastLoginAt | datetime | 最近登录时间 |

### 12.4.1 UserSectionScope

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| userId | uuid | 授权用户 |
| sectionId | uuid | 可访问标段 |
| grantedBy | uuid | 授权人 |
| grantedAt | datetime | 授权时间 |

### 12.5 Area

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| projectId | uuid | 所属项目 |
| parentId | uuid | 父级区域，可为空 |
| name | string | 区域名称 |
| code | string | 区域编码 |
| isActive | boolean | 是否启用 |

### 12.6 Discipline

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| projectId | uuid | 所属项目 |
| name | string | 专业名称 |
| code | string | 专业编码 |
| isActive | boolean | 是否启用 |

### 12.9 SiteItem

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| projectId | uuid | 所属项目 |
| sectionId | uuid | 所属标段 |
| itemNo | string | 事项编号 |
| type | enum | defect, punch |
| status | enum | pending_approval, dispatched, rectifying, pending_acceptance, closed, voided |
| severity | enum | normal, important, severe |
| title | string | 标题 |
| description | text | 描述 |
| areaId | uuid | 区域 |
| disciplineId | uuid | 专业 |
| locationText | string | 文字位置描述 |
| responsibleOrgId | uuid | 责任单位 |
| responsibleUserId | uuid | 责任人 |
| createdBy | uuid | 创建人 |
| defaultDueAt | datetime | 按严重等级计算的默认截止时间 |
| dueAt | datetime | 截止时间 |
| dueAdjustedBy | uuid | 期限调整人，可为空 |
| dueAdjustedAt | datetime | 期限调整时间，可为空 |
| dueAdjustmentReason | text | 期限调整原因，可为空 |
| submittedForReviewAt | datetime | 提交复验时间 |
| closedAt | datetime | 关闭时间 |
| reopenedAt | datetime | 最近重开时间 |
| voidedAt | datetime | 作废时间 |
| createdAt | datetime | 创建时间 |
| updatedAt | datetime | 更新时间 |

### 12.10 PhotoAttachment

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| siteItemId | uuid | 关联事项，可为空 |
| stage | enum | discovery, rectification, review，可为空 |
| originalKey | string | 原图 Key |
| thumbnailKey | string | 缩略图 Key |
| fileName | string | 文件名 |
| fileSize | number | 文件大小 |
| mimeType | string | 文件类型 |
| uploadedBy | uuid | 上传人 |
| uploadedAt | datetime | 上传时间 |
| sectionSnapshot | string | 绑定时标段快照，可为空 |
| areaSnapshot | string | 绑定时区域快照，可为空 |
| disciplineSnapshot | string | 绑定时专业快照，可为空 |
| responsibleOrgSnapshot | string | 绑定时责任单位快照，可为空 |

### 12.11 WorkflowLog

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| siteItemId | uuid | 事项 |
| action | enum | create, dispatch, start_rectify, submit_review, close, void, reopen, comment |
| fromStatus | enum | 变更前状态 |
| toStatus | enum | 变更后状态 |
| comment | text | 说明 |
| actorId | uuid | 操作人 |
| createdAt | datetime | 操作时间 |

### 12.12 Notification

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| recipientId | uuid | 接收人 |
| siteItemId | uuid | 关联事项 |
| type | enum | assigned, review_requested, due_soon, overdue, voided, reopened |
| title | string | 标题 |
| content | text | 内容 |
| readAt | datetime | 已读时间 |
| createdAt | datetime | 创建时间 |

### 12.13 ExportJob

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| type | enum | excel, photo_package, pdf, audit |
| status | enum | queued, running, succeeded, failed |
| params | json | 导出参数 |
| artifactKey | string | 结果文件 Key |
| artifactFileName | string | 结果文件名 |
| artifactMimeType | string | 结果 MIME 类型 |
| errorMessage | text | 失败原因 |
| requestedBy | uuid | 发起人 |
| createdAt | datetime | 创建时间 |
| completedAt | datetime | 完成时间 |

### 12.14 ImportJob

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| kind | enum | users, organizations, sections, areas, disciplines |
| status | enum | queued, running, succeeded, failed |
| sourceFileName | string | 来源文件名 |
| acceptedRows | number | 通过行数 |
| rejectedRows | number | 拒绝行数 |
| errors | json | 行级错误，包含 rowNumber、field、message |
| errorMessage | text | 失败原因 |
| requestedBy | uuid | 发起人 |
| createdAt | datetime | 创建时间 |
| completedAt | datetime | 完成时间 |

### 12.15 AuditLog

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| actorId | uuid | 操作人 |
| action | string | 操作类型 |
| resourceType | string | 资源类型 |
| resourceId | uuid | 资源 ID |
| ipAddress | string | IP 地址 |
| userAgent | string | 浏览器信息 |
| metadata | json | 附加信息 |
| createdAt | datetime | 创建时间 |

### 12.15 IdempotencyRecord

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| key | string | 幂等键，同一用户范围内唯一 |
| actorId | uuid | 发起用户 |
| method | string | HTTP 方法 |
| path | string | 请求路径 |
| requestHash | string | 请求体摘要 |
| responseStatus | number | 首次处理返回状态码 |
| responseBody | json | 首次处理返回结果 |
| createdAt | datetime | 创建时间 |
| expiresAt | datetime | 过期时间 |

## 13. API 设计

### 13.0 通用 API 约定

- 所有写接口必须支持 `Idempotency-Key` 请求头，客户端在弱网重试和重复点击时复用同一个幂等键。
- 幂等范围为 `actorId + method + path + Idempotency-Key`。同一幂等键重复请求时，若请求体摘要一致，返回首次处理结果；若请求体摘要不一致，返回 409。
- 幂等记录默认保留 24 小时，覆盖新建事项、照片完成上传、派发、开始整改、提交复验、关闭、作废、重开、评论、导入和导出任务创建。
- 所有列表、详情、看板、导出、审计查询接口必须在服务端按用户角色、所属单位和 `UserSectionScope` 过滤。

### 13.1 Auth

- `POST /auth/login`：账号密码登录。
- `POST /auth/logout`：退出登录。
- `GET /auth/me`：获取当前用户。
- `POST /auth/change-password`：当前用户修改自己的密码，需提交当前密码和新密码；成功后旧 Token 失效。

### 13.2 Users

- `GET /users`：用户列表。
- `POST /users`：创建用户。
- `PATCH /users/:id`：更新用户。
- `PATCH /users/:id/disable`：停用用户。
- `POST /users/:id/reset-password`：重置密码。

### 13.3 Master Data

- `GET /master-data/sections`、`POST /master-data/sections`。
- `GET /master-data/organizations`、`POST /master-data/organizations`。
- `GET /master-data/areas`、`POST /master-data/areas`。
- `GET /master-data/disciplines`、`POST /master-data/disciplines`。

### 13.4 Imports

- `POST /imports/users`：批量导入用户。
- `POST /imports/organizations`：批量导入单位。
- `POST /imports/sections`：批量导入标段。
- `POST /imports/areas`：批量导入区域。
- `POST /imports/disciplines`：批量导入专业。
- `GET /imports/:id`：查看导入结果。

### 13.6 Site Items

- `GET /site-items`：事项列表。
- `POST /site-items`：创建事项。
- `GET /site-items/:id`：事项详情。
- `PATCH /site-items/:id`：编辑未关闭事项基础信息。
- `POST /site-items/:id/dispatch`：派发责任单位和责任人。
- `POST /site-items/:id/start-rectify`：开始整改。
- `POST /site-items/:id/submit-review`：提交复验。
- `POST /site-items/:id/close`：复验关闭。
- `POST /site-items/:id/void`：作废。
- `POST /site-items/:id/reopen`：重开。
- `POST /site-items/:id/comments`：追加处理意见。

### 13.7 Photos

- `POST /photos/presign`：获取上传地址。
- `POST /photos/complete`：完成上传并创建附件记录。
- `GET /photos/:id/preview`：获取预览地址。
- `DELETE /photos/:id`：删除照片，需权限校验并写审计日志。

### 13.8 Notifications

- `GET /notifications`：通知列表。
- `GET /notifications/unread-count`：未读数量。
- `POST /notifications/:id/read`：标记已读。
- `POST /notifications/read-all`：全部已读。

### 13.9 Dashboard

- `GET /dashboard/summary`：总览统计。
- `GET /dashboard/status-distribution`：状态分布。
- `GET /dashboard/overdue`：超期统计。
- `GET /dashboard/by-area`：区域统计。
- `GET /dashboard/by-discipline`：专业统计。
- `GET /dashboard/by-organization`：责任单位统计。

### 13.10 Exports

- `POST /exports/site-items`：创建 Excel 台账导出任务。
- `POST /exports/photo-package`：创建照片包导出任务。
- `POST /exports/site-items/:id/pdf`：创建单事项 PDF 导出任务。
- `POST /exports/audit`：创建审计导出任务。
- `GET /exports/:id`：查看导出任务状态。
- `GET /exports/:id/download`：下载导出结果。

### 13.11 Audit

- `GET /audit/logs`：审计日志查询。

## 14. 页面设计

### 14.1 手机端页面

#### 登录页

- 用户名/手机号。
- 密码。
- 登录按钮。
- 登录失败提示。

#### 待办页

- 顶部统计：待整改、待复验、临期、超期。
- 快捷按钮：新建事项、拍照。
- 待办列表：事项卡片展示状态、标题、区域、专业、责任单位、截止时间、照片数。
- 筛选：状态、事项类型、严重等级。

#### 事项列表页

- 搜索框。
- 筛选条件：标段、区域、专业、责任单位、状态、是否超期。
- 事项卡片列表。
- 点击进入详情。

#### 新建事项页

- 事项类型。
- 严重等级。
- 标题。
- 描述。
- 标段。
- 区域。
- 专业。
- 位置描述。
- 截止时间。
- 发现照片。
- 保存草稿。
- 提交。

#### 事项详情页

- 状态条。
- 基本信息。
- 照片分组：发现、整改、复验。
- 流程日志。
- 当前可执行操作：派发、开始整改、提交复验、关闭、作废、重开。

#### 拍照页

- 调用相机或选择相册。
- 上传队列。
- 现场图库。
- 显示未绑定或已绑定事项/阶段。
- 失败重试。

#### 看板页

- 总数、待处理、待复验、超期。
- 状态分布。
- 超期责任单位排行。
- 区域统计。

#### 我的页

- 用户信息。
- 通知入口。
- 草稿箱。
- 修改密码。
- 退出登录。

### 14.2 桌面端页面

#### 看板首页

- 总览统计卡。
- 状态分布。
- 超期趋势。
- 区域、专业、责任单位排行。
- 快速筛选。

#### 事项管理

- 表格列表。
- 多条件筛选。
- 批量导出。
- 详情抽屉或详情页。

#### 基础数据

- 标段管理。
- 单位管理。
- 区域管理。
- 专业管理。
- Excel 导入。

#### 用户管理

- 用户列表。
- 创建/编辑用户。
- 分配角色。
- 停用。
- 重置密码。

#### 导入导出

- 导入记录。
- 导出任务。
- 下载历史。

#### 审计日志

- 按用户、时间、资源类型、操作类型筛选。
- 查看详情。
- 导出审计记录。

## 15. 弱网与草稿

首版不做完整离线，但必须支持弱网体验：

- 新建事项页面自动保存本地草稿。
- 照片上传失败保留待上传队列。
- 用户可手动重试。
- 提交接口必须使用 `Idempotency-Key`，避免重复点击生成重复事项、重复照片记录或重复流程日志。
- 草稿只保存在当前设备，不做跨设备同步。

## 16. 安全与审计

### 16.1 登录安全

- 密码必须哈希保存。
- 登录失败次数过多应短时间限制。
- Token 设置过期时间。
- Token 必须绑定当前密码哈希摘要，修改密码后旧 Token 失效，前端清除本地会话并要求重新登录。

### 16.2 数据权限

- 所有列表和详情接口必须做服务端权限过滤。
- 前端隐藏按钮不能替代后端权限判断。
- 导出任务必须继承当前用户可见数据范围。

### 16.3 审计

写入审计日志的操作包括：

- 登录、退出。
- 用户创建、停用、重置密码。
- 基础数据变更。
- 事项创建、派发、整改、关闭、作废、重开。
- 照片删除。
- 导入导出。

### 16.4 备份

- PostgreSQL 每日备份一次，保留最近 30 天。
- MinIO 对象存储每日增量备份。
- 管理员后台显示最近一次备份时间和状态。
- 备份失败生成管理员站内通知。

## 17. 测试计划

### 17.1 业务闭环测试

- 手机端新建缺陷，选择区域、专业、填写位置描述并上传发现照片。
- 业主/监理派发给施工单位负责人和整改人。
- 整改人提交整改说明和整改照片。
- 业主/监理复验并关闭。
- 看板统计同步更新。

### 17.2 异常流程测试

- 待审核事项可作废，作废后不出现在待办。
- 已关闭事项可重开，重开后重新进入整改中。
- 作废和重开必须记录 WorkflowLog 和 AuditLog。

### 17.3 权限测试

- 现场整改人不能关闭事项。
- 施工单位负责人不能查看其他单位事项。
- 业主/监理只能查看授权标段。
- 导出数据范围与用户权限一致。
- 取消某用户的标段授权后，该用户不能再通过详情接口、看板接口或导出接口访问该标段数据。

### 17.5 通知测试

- 派发后责任人收到通知。
- 提交复验后业主/监理收到通知。
- 到期前 1 天生成临期提醒。
- 超期当天生成超期提醒。
- 同一事项同类提醒每天不重复生成。

### 17.6 归档测试

- Excel 台账字段完整。
- 照片包目录和事项编号匹配。
- PDF 闭环单包含照片、流程日志和签认信息。
- 导出任务失败时能看到错误状态。
- 事项编辑、责任单位变更或重开后，历史照片仍保留上传当时的标段、区域、专业和责任单位快照。

### 17.7 幂等测试

- 使用同一个 `Idempotency-Key` 重复提交新建事项，只生成一条事项记录。
- 使用同一个 `Idempotency-Key` 重复完成照片上传，只生成一条照片附件记录。
- 同一个 `Idempotency-Key` 携带不同请求体重复提交时返回 409。
- 派发、整改、关闭、作废、重开重复提交时不生成重复 WorkflowLog。

### 17.8 UI 测试

- 手机小屏下事项卡片不溢出。
- 底部导航单手可操作。
- 状态颜色在列表、详情、看板一致。
- 桌面看板筛选后统计正确。
- 表单长单位名、长区域名、长标题显示合理。

## 18. 验收标准

首版交付满足以下条件即可验收：

1. 四类角色可登录并按权限使用系统。
2. 缺陷和尾工事项可完整走完闭环。
3. 照片上传和流程日志完整保存。
4. 站内通知、临期、超期提醒可正常生成。
5. 看板统计与事项台账一致。
6. Excel 台账、照片包、PDF 闭环单可导出。
7. 数据权限、审计日志和备份检查可用。
8. 手机端高频流程可顺畅完成。

## 19. 后续版本建议

- 企业微信、钉钉、短信或邮件通知。
- 深色指挥中心大屏。
- PDF 模板配置和电子签章。
- 完整离线同步。
- CAD/DWG 转换和 BIM 集成。
- 可配置 SLA、催办升级和审批流程。
- 强防篡改审计、导出审批和访问水印。
- 多项目公司级平台化。
