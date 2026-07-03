# 后端基础环境说明

## 本地脚本

- `npm run build:api`：编译 `apps/api` TypeScript 后端。
- `npm run start:api`：启动编译后的 API，默认监听 `127.0.0.1:4000`。
- `npm run test:api`：运行后端 API 与权限测试。
- `npm run typecheck:api`：只做 TypeScript 类型检查。
- `npm --workspace @site-management/api run test:db:setup`：对 `TEST_DATABASE_URL` 应用迁移并写入演示种子数据。
- `npm --workspace @site-management/api run test:db:reset`：重置 `TEST_DATABASE_URL` 后重新迁移和 seed；未设置 `TEST_DATABASE_URL` 时需要显式 `ALLOW_DATABASE_RESET=true`。
- `npm run infra:up`：启动 PostgreSQL、Redis、MinIO、API 和 Web。
- `npm run infra:down`：停止本地基础设施。

## 环境变量

后端默认值见 [apps/api/.env.example](/Users/yang/Documents/project123/apps/api/.env.example)。首版支持：

- API 地址：`API_HOST`、`API_PORT`
- PostgreSQL：`DATABASE_URL`
- PostgreSQL 测试库：`TEST_DATABASE_URL`
- API 运行模式：`API_RUNTIME=memory|prisma`，当前默认 `memory`；`prisma` 模式需等后续路由接线任务完成后启用
- Redis：`REDIS_URL`
- MinIO/S3：`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`
- 认证与上传限制：`JWT_SECRET`、`UPLOAD_MAX_BYTES`、`IDEMPOTENCY_TTL_HOURS`

## 数据库

Prisma 数据模型位于 [schema.prisma](/Users/yang/Documents/project123/apps/api/prisma/schema.prisma)，初始 SQL 位于 [migration.sql](/Users/yang/Documents/project123/apps/api/prisma/migrations/20260629000100_init/migration.sql)。

本地 PostgreSQL 默认映射到 `127.0.0.1:55432`，避免和本机已有 `5432` 服务冲突。执行 `npm run db:generate` 生成 Prisma Client，执行 `npm run db:migrate` 应用初始迁移，执行 `npm run db:seed` 写入演示项目、四类角色、基础数据和示例事项。

数据库集成测试应使用独立的 `TEST_DATABASE_URL`。`test:db:setup` 适合首次准备测试库，`test:db:reset` 适合每轮集成测试前恢复到可重复的 seed 状态。

## 默认测试账号

- 管理员：`admin` / `admin123`
- 业主/监理：`wang.supervisor` / `password123`
- 施工单位负责人：`li.manager` / `password123`
- 整改人：`zhao.fix` / `password123`
