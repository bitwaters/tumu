# 后端基础环境说明

## 本地脚本

- `npm run build:api`：编译 `apps/api` TypeScript 后端。
- `npm run start:api`：启动编译后的 API，默认监听 `127.0.0.1:4000`。
- `npm run test:api`：运行后端 API 与权限测试。
- `npm run typecheck:api`：只做 TypeScript 类型检查。
- `npm run build:web`：按默认 API 模式构建前端；需要 mock 原型时使用 `VITE_USE_MOCKS=true npm run build:web`。
- `npm --workspace @site-management/api run test:db:setup`：对 `TEST_DATABASE_URL` 应用迁移并写入演示种子数据；未设置 `TEST_DATABASE_URL` 时需要显式 `ALLOW_DATABASE_SEED=true`。
- `npm --workspace @site-management/api run test:db:reset`：重置 `TEST_DATABASE_URL` 后重新迁移和 seed；未设置 `TEST_DATABASE_URL` 时需要显式 `ALLOW_DATABASE_RESET=true`。
- `TEST_DATABASE_URL=... npm run test:api`：运行包含 Prisma/PostgreSQL 路由合同测试的后端测试；未设置 `TEST_DATABASE_URL` 时该组数据库测试会自动跳过。
- `npm run infra:up`：启动 PostgreSQL、Redis、MinIO、API 和 Web。
- `npm run infra:down`：停止本地基础设施。

## Web/API 联调

默认前端连接 `http://127.0.0.1:4000`。本地联调推荐顺序：

```bash
npm run infra:up
npm run db:migrate
npm run db:seed
npm run build:api
npm run start:api
VITE_API_BASE_URL=http://127.0.0.1:4000 npm run dev:web
```

如只查看 UI 原型，可跳过 API 和数据库，使用：

```bash
VITE_USE_MOCKS=true npm run dev:web
```

照片上传需要 `S3_ENDPOINT` 指向可访问的 MinIO/S3 服务；前端会先调用 `/photos/presign`，再上传对象，最后调用 `/photos/complete` 写入图库记录。

## 环境变量

后端默认值见 [apps/api/.env.example](/Users/yang/Documents/project123/apps/api/.env.example)。首版支持：

- API 地址：`API_HOST`、`API_PORT`
- PostgreSQL：`DATABASE_URL`
- PostgreSQL 测试库：`TEST_DATABASE_URL`
- API 运行模式：`API_RUNTIME=prisma|memory`，当前默认 `prisma`；`memory` 仅保留为旧内存路由的显式调试/参考模式
- Redis：`REDIS_URL`
- MinIO/S3：`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`
- 认证与上传限制：`JWT_SECRET`、`UPLOAD_MAX_BYTES`、`IDEMPOTENCY_TTL_HOURS`

## 数据库

Prisma 数据模型位于 [schema.prisma](/Users/yang/Documents/project123/apps/api/prisma/schema.prisma)，初始 SQL 位于 [migration.sql](/Users/yang/Documents/project123/apps/api/prisma/migrations/20260629000100_init/migration.sql)。

本地 PostgreSQL 默认映射到 `127.0.0.1:55432`，避免和本机已有 `5432` 服务冲突。执行 `npm run db:generate` 生成 Prisma Client，执行 `npm run db:migrate` 通过 Prisma migration history 应用迁移，不会写入或清空业务数据。执行 `npm run db:seed` 会写入演示项目、四类角色、基础数据和示例事项；seed 会重置演示数据，只用于本地初始化或明确需要刷新演示数据的环境。

Prisma Client 7 运行时通过 `@prisma/adapter-pg` 连接 PostgreSQL，连接配置集中在 [prisma.ts](/Users/yang/Documents/project123/apps/api/src/runtime/prisma.ts)。默认 API 运行时已经使用 Prisma/PostgreSQL；请确保 `DATABASE_URL` 指向已迁移和 seed 的 PostgreSQL。旧内存路由只在显式设置 `API_RUNTIME=memory` 时启用。

数据库集成测试应使用独立的 `TEST_DATABASE_URL`。`test:db:setup` 适合首次准备测试库，`test:db:reset` 适合每轮集成测试前恢复到可重复的 seed 状态。

如果使用仓库内 Docker Compose，首次运行测试库前需要创建测试数据库：

```bash
npm run infra:up
docker compose -f infra/docker-compose.yml exec postgres createdb -U site_user site_management_test
TEST_DATABASE_URL=postgresql://site_user:site_password@127.0.0.1:55432/site_management_test npm --workspace @site-management/api run test:db:reset
TEST_DATABASE_URL=postgresql://site_user:site_password@127.0.0.1:55432/site_management_test npm run test:api
```

如果只想验证主业务库，可以使用 `DATABASE_URL` 运行 `db:migrate`、`db:seed` 和 `API_RUNTIME=prisma npm run start:api`；不要把共享或生产数据库作为 `TEST_DATABASE_URL` 执行 reset。

## 默认测试账号

- 管理员：`admin` / `admin123`
- 业主/监理：`wang.supervisor` / `password123`
- 施工单位负责人：`li.manager` / `password123`
- 整改人：`zhao.fix` / `password123`
