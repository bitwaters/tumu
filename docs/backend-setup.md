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
- `npm run prod:init-env -- --host <SERVER_HOST_OR_IP>`：生成 `.env.production`，写入随机生产密钥和 host 派生的公开访问地址；已有文件默认不会被覆盖。
- `npm run prod:deploy -- --host <SERVER_HOST_OR_IP>`：一键执行生产 env 初始化、预检查、镜像构建、Compose 启动、数据库迁移、状态检查和烟测；已有 `.env.production` 时会复用现有配置。
- `npm run prod:preflight`：读取 `.env.production` 并验证生产部署必填项、密钥、备份目录和 Compose 配置。
- `npm run prod:build`：构建生产 API/Web 镜像。
- `npm run prod:migrate`：对生产数据库执行 Prisma migrations，不写入演示 seed。
- `npm run prod:up` / `npm run prod:down` / `npm run prod:status`：管理生产 Compose 服务。
- `npm run prod:smoke`：验证生产 API/Web 健康、登录、事项列表和通知计数。
- `npm run backup:db` / `npm run backup:objects`：创建生产数据库和对象存储备份。

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
- 认证与上传限制：`JWT_SECRET`、`JWT_TTL_HOURS`、`UPLOAD_MAX_BYTES`、`IDEMPOTENCY_TTL_HOURS`

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

## 生产部署

生产部署使用 [production-deployment.md](/Users/yang/Documents/project123/docs/production-deployment.md) 和 `.env.production`。首次部署推荐运行 `npm run prod:init-env -- --host <SERVER_HOST_OR_IP>` 生成 `.env.production`，并将占位符替换为实际生产主机名或内网 IP；`.env.production.example` 只作为人工配置参考，不应直接带着 `CHANGE_ME` 示例值上线。生产环境与本地开发的关键差异：

- 使用根目录 `docker-compose.yml`，不挂载源码、不运行 Vite dev server。
- Web 使用 Nginx 托管构建后的静态文件。
- API 使用编译后的 `dist/index.js`。
- 密钥、数据库密码、对象存储密码和公开访问地址都来自 `.env.production`。
- `.env.production` 含真实密钥，已被 Git 忽略，不应提交或写入文档。
- `SMOKE_USERNAME` 和 `SMOKE_PASSWORD` 必须匹配真实生产账号，才能通过上线烟测。
- 数据库迁移必须通过 `npm run prod:migrate` 显式执行。
- 生产环境禁止执行 `db:seed`、`test:db:reset` 或任何 reset 类命令。
- 备份与恢复按 [backup-restore.md](/Users/yang/Documents/project123/docs/backup-restore.md) 执行。

## 默认测试账号

本地 seed 会创建管理员、业主/监理、施工单位负责人和整改人等演示账号。演示初始密码只用于本地或空库验证，不应写入公开文档或生产交付文档；生产环境执行 seed 前必须设置 `SEED_DEMO_PASSWORD`，或同时设置 `SEED_ADMIN_PASSWORD` 和 `SEED_USER_PASSWORD`。生产环境首次登录后必须立即修改密码。
