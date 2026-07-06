# 前端先行原型契约

本文档记录 `frontend-first-site-management-ui` 变更中前端 mock 原型已经固定的后端对接契约。后续 API、数据库和对象存储实现应尽量保持这些字段和交互语义。

## 1. 领域对象

前端当前使用的核心类型位于 `apps/web/src/types.ts`：

- `User`：必须包含 `role`、`organizationId`、`sectionScopeIds`，用于验证角色和标段范围。
- `SiteItem`：统一表示缺陷和尾工，必须包含 `type`、`status`、`severity`、`sectionId`、`areaId`、`disciplineId`、`locationText`、`responsibleOrgId`、`responsibleUserId`、`dueAt`。
- `PhotoAttachment`：支持未绑定照片；绑定事项后必须保留绑定时的标段、区域、专业和责任单位快照。
- `WorkflowLog`：状态动作必须记录 `action`、`fromStatus`、`toStatus`、`actorId`、`createdAt`。
- `Notification`：站内通知必须包含接收人、关联事项、类型、已读状态和创建时间。
- `ExportJob`：导出任务必须包含 `type`、`status`、`requestedBy`、`createdAt`、`completedAt`、`artifactFileName`、`artifactMimeType`、`errorMessage`。
- `ImportJob`：导入任务必须包含 `kind`、`status`、`requestedBy`、`acceptedRows`、`rejectedRows`、`errors`，错误项需要有行号、字段和消息。

## 2. 状态与动作

前端已固定的事项状态：

- `pending_approval`
- `dispatched`
- `rectifying`
- `pending_acceptance`
- `closed`
- `voided`

前端已固定的 mock 动作：

- `dispatch`
- `assign_rectifier`
- `start_rectify`
- `submit_review`
- `close`
- `void`
- `reopen`
- `comment`

后端实现时需要继续保证：

- 现场整改人不能关闭或作废事项。
- 施工单位负责人只能给本单位事项分配本单位启用的整改人。
- 业主/监理可复验关闭、作废和重开授权标段内事项。
- 重复提交需要通过幂等键或等价机制避免重复事项、重复照片和重复日志。

## 3. 现场照片

- 拍照页是现场图库，照片可先上传为未绑定状态，再由新建、整改或复验表单绑定到事项。
- 现场图库和上传队列必须按当前用户隔离；表单点击选择照片后进入图库选择模式，确认后返回原表单，避免在表单内一次性展示大量未绑定照片。
- 照片证据展示依赖上传时快照，不能只依赖事项当前状态。

## 4. UI 对接要求

- 移动端导航固定为：`待办`、`事项`、`拍照`、`设置`。
- 桌面端导航固定为：事项中心、现场图库、基础数据、导入导出、系统设置。
- 事项中心包含页内标签：`待我处理`、`全部事项`、`统计看板`，避免首页看板、待办处理和事项管理作为独立入口重复出现。
- 基础数据包含页内标签：`标段区域专业`、`用户权限`。
- 系统设置包含页内标签：`个人与系统`、`审计日志`；非管理员只显示个人设置能力。
- 状态颜色语义保持一致：蓝色进行中、绿色关闭、橙色待复验/临期、红色严重/超期、灰色作废。
- 通知未读数需要支持移动端红点或数量展示。
- 桌面端导入导出页需要支持创建事项台账、照片包、单事项 PDF 闭环单导出任务，并展示任务状态、刷新和下载动作。
- 桌面端导入基础数据只对管理员显示；管理员可以选择 CSV 文件或粘贴 CSV 内容，提交后展示通过行、拒绝行和行级错误。
- 审计日志页的导出按钮创建审计导出任务，下载统一从导入导出页的导出任务列表进入。

## 5. 前端运行模式

- 默认使用 API 模式，`VITE_API_BASE_URL` 未配置时连接 `http://127.0.0.1:4000`。
- 只有显式设置 `VITE_USE_MOCKS=true` 时才进入 mock 原型模式；mock 模式保留本地角色切换和本地状态变更。
- API 模式登录使用后端 `/auth/login`，刷新页面后通过 `/auth/me` 恢复当前用户。
- 个人页修改密码使用 `/auth/change-password`，请求体为 `{ "currentPassword": "...", "newPassword": "..." }`；成功后前端必须清除本地会话并返回登录页。
- 后端签发 Token 时绑定当前密码哈希摘要；修改密码后，旧 Token 调用任何认证接口都必须失败。
- API 模式的事项列表、详情、流程动作、图库、照片预览、照片上传、删除和通知均通过后端接口；失败时显示错误，不自动回退到 mock 数据。
- 本地验证 API 模式时应先启动 PostgreSQL、MinIO、API，再启动 Web。照片上传依赖 MinIO/S3 上传地址可访问。

## 6. 导入导出接口

### 6.1 导出

- `POST /exports/site-items`：创建事项台账导出任务，请求体复用事项列表过滤字段，如 `status`、`type`、`severity`、`sectionId`、`areaId`、`disciplineId`、`organizationId`、`overdue`、`search`。
- `POST /exports/photo-package`：创建照片包导出任务，请求体同事项台账过滤字段。
- `POST /exports/site-items/:id/pdf`：创建单事项 PDF 闭环单导出任务。
- `POST /exports/audit`：创建审计导出任务，仅管理员可用，请求体复用审计查询字段，如 `resourceType`、`action`。
- `GET /exports/:id`：刷新导出任务状态。
- `GET /exports/:id/download`：下载成功任务，返回 `downloadUrl` 或 `contentBase64`、`fileName`、`mimeType`。

导出权限：管理员、业主/监理、施工单位负责人可导出事项台账、照片包和可见事项 PDF；审计导出仅管理员可用。所有导出必须由后端按当前用户角色、单位和授权标段过滤。

### 6.2 导入

- `POST /imports/:kind`：创建基础数据导入任务，`kind` 取值为 `sections`、`organizations`、`areas`、`disciplines`、`users`。
- `GET /imports/:id`：查看导入结果。

导入请求体使用 `{ "csvText": "...", "sourceFileName": "import.csv" }`，并必须带 `Idempotency-Key`。导入仅管理员可用；导入结果必须展示 `acceptedRows`、`rejectedRows` 和 `errors`，用户导入结果不得暴露密码哈希。
