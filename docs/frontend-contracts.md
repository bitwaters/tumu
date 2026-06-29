# 前端先行原型契约

本文档记录 `frontend-first-site-management-ui` 变更中前端 mock 原型已经固定的后端对接契约。后续 API、数据库和对象存储实现应尽量保持这些字段和交互语义。

## 1. 领域对象

前端当前使用的核心类型位于 `apps/web/src/types.ts`：

- `User`：必须包含 `role`、`organizationId`、`sectionScopeIds`，用于验证角色和标段范围。
- `SiteItem`：统一表示缺陷和尾工，必须包含 `type`、`status`、`severity`、`sectionId`、`areaId`、`disciplineId`、`locationText`、`responsibleOrgId`、`responsibleUserId`、`dueAt`。
- `DrawingRevision` 与 `DrawingRevisionPage`：多页 PDF 必须按页提供 `pageNumber`、`previewKey`、`width`、`height`。
- `PhotoAttachment`：支持未绑定照片；绑定事项后必须保留绑定时的标段、区域、专业和责任单位快照。
- `WorkflowLog`：状态动作必须记录 `action`、`fromStatus`、`toStatus`、`actorId`、`createdAt`。
- `Notification`：站内通知必须包含接收人、关联事项、类型、已读状态和创建时间。

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

## 3. 图纸档案与照片

- 图纸只作为后台档案和预览资料管理，首版事项不关联图纸定位信息。
- 多页图纸预览必须提供 `pageNumber` 和 `previewKey`。
- 拍照页是现场图库，照片可先上传为未绑定状态，再由新建、整改或复验表单绑定到事项。
- 现场图库和上传队列必须按当前用户隔离；表单点击选择照片后进入图库选择模式，确认后返回原表单，避免在表单内一次性展示大量未绑定照片。
- 照片证据展示依赖上传时快照，不能只依赖事项当前状态。

## 4. UI 对接要求

- 移动端导航固定为：`待办`、`事项`、`拍照`、`看板`、`我的`。
- 桌面端导航固定为：首页看板、事项管理、图纸管理、基础数据、用户与权限、导入导出、审计日志。
- 状态颜色语义保持一致：蓝色进行中、绿色关闭、橙色待复验/临期、红色严重/超期、灰色作废。
- 通知未读数需要支持移动端红点或数量展示。
