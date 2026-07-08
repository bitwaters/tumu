# 生产部署手册

本文档面向项目内网单服务器或单 VM 部署。生产部署使用根目录 [docker-compose.yml](/Users/yang/Documents/project123/docker-compose.yml) 管理 Web、API、PostgreSQL、Redis 和 MinIO。

## 1. 前置条件

- Linux 服务器已安装 Docker Engine 和 Docker Compose plugin。
- 服务器能访问项目代码或发布包。
- 已规划持久化磁盘和备份目录，例如 `/var/backups/site-management`。
- 已确认生产访问主机名或内网 IP，例如 `power-site.internal` 或 `<SERVER_HOST_OR_IP>`。
- 已准备或计划创建用于上线烟测的生产账号。

## 2. 首次部署

1. 准备备份目录：

```bash
sudo mkdir -p /var/backups/site-management
sudo chown "$USER":"$USER" /var/backups/site-management
```

2. 运行一键部署命令。首次部署时如果 `.env.production` 不存在，命令会先生成生产环境文件，然后依次执行预检查、构建镜像、启动服务、数据库迁移、状态检查和上线烟测：

```bash
npm run prod:deploy -- --host <SERVER_HOST_OR_IP> --smoke-username wang.supervisor --smoke-password STRONG_SMOKE_PASSWORD
```

将 `<SERVER_HOST_OR_IP>` 替换为实际生产主机名或内网 IP。已有 `.env.production` 时，一键部署会复用现有文件，不会覆盖生产密钥。若生产烟测账号尚未创建，可先运行：

```bash
npm run prod:deploy -- --host <SERVER_HOST_OR_IP> --skip-smoke
```

烟测账号创建或导入后，再运行：

```bash
npm run prod:smoke
```

根目录已经提供生产 [docker-compose.yml](/Users/yang/Documents/project123/docker-compose.yml)。如只需要直接操作容器，可以使用：

```bash
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f api
```

首次上线仍推荐使用 `npm run prod:deploy`，因为它会额外执行预检查、数据库迁移和烟测，避免只启动了容器但应用未完成初始化。

## 3. 环境文件说明

如需单独生成生产环境文件，可运行：

```bash
npm run prod:init-env -- --host <SERVER_HOST_OR_IP> --smoke-username wang.supervisor --smoke-password STRONG_SMOKE_PASSWORD
```

将 `<SERVER_HOST_OR_IP>` 替换为实际生产主机名或内网 IP。`--host` 不要带 `http://`、端口或路径。脚本会生成 `.env.production`，自动写入 PostgreSQL、MinIO、JWT、演示 seed 初始密码等随机生产密钥，并按 host 生成：

- `PUBLIC_API_BASE_URL`
- `PUBLIC_WEB_BASE_URL`
- `API_CORS_ORIGIN`

常用可选参数：

- `--api-port 4000`：公开 API 端口，默认 `4000`。
- `--web-port 8080`：公开 Web 端口，默认 `8080`。
- `--backup-dir /var/backups/site-management`：备份目录。
- `--image-tag release-20260703`：生产镜像 tag。
- `--force`：确认覆盖已有 `.env.production`。

`.env.production.example` 仅作为人工配置参考。不要把示例文件中的 `CHANGE_ME` 值用于生产。

检查 `.env.production`：

- `SMOKE_USERNAME` 和 `SMOKE_PASSWORD` 必须与后续创建或导入的真实生产账号一致，否则 `npm run prod:smoke` 会失败。
- 只有在空库需要演示账号时才执行 `prisma:seed`；执行前必须确认 `.env.production` 中存在 `SEED_DEMO_PASSWORD`，或同时存在 `SEED_ADMIN_PASSWORD` 和 `SEED_USER_PASSWORD`。
- 如使用非默认端口、反向代理或域名，需要确认 `PUBLIC_API_BASE_URL` 和 `PUBLIC_WEB_BASE_URL` 是用户浏览器可访问的地址，且 `API_CORS_ORIGIN` 等于浏览器实际打开 Web 的源地址。
- `.env.production` 含真实密钥，不应提交到 Git，也不要复制到不受控的位置。

## 4. 手动分步部署

如需排障或精确控制部署步骤，可以手动执行：

1. 运行预检查：

```bash
npm run prod:preflight
```

2. 构建生产镜像：

```bash
npm run prod:build
```

3. 启动数据库、缓存、对象存储和应用：

```bash
npm run prod:up
```

4. 执行数据库迁移：

```bash
npm run prod:migrate
```

5. 查看服务状态：

```bash
npm run prod:status
```

6. 运行上线烟测：

```bash
npm run prod:smoke
```

7. 记录上线信息：

```bash
git rev-parse HEAD
docker compose --env-file .env.production -f docker-compose.yml ps
```

## 5. 日常启动与停止

启动：

```bash
npm run prod:up
```

停止应用和基础设施：

```bash
npm run prod:down
```

查看状态：

```bash
npm run prod:status
```

查看日志：

```bash
docker compose --env-file .env.production -f docker-compose.yml logs -f api
docker compose --env-file .env.production -f docker-compose.yml logs -f web
```

## 6. 升级流程

1. 确认最近一次数据库和对象存储备份可用。
2. 拉取或切换到新版本代码。
3. 优先运行一键部署：

```bash
npm run prod:deploy
```

如需手动分步执行：

```bash
npm run prod:preflight
npm run prod:build
npm run prod:migrate
npm run prod:up
npm run prod:smoke
```

4. 记录升级后的 Git commit、镜像 tag、迁移时间和烟测结果。

## 7. 回滚流程

应用代码回滚：

1. 切回上一版 Git commit 或镜像 tag。
2. 重新构建并启动：

```bash
npm run prod:build
npm run prod:up
npm run prod:smoke
```

数据回滚必须谨慎处理。只有在确认需要恢复数据时，才按 [backup-restore.md](/Users/yang/Documents/project123/docs/backup-restore.md) 执行数据库和对象存储恢复。

## 8. 健康检查

- API：`GET /health`
- Web：`GET /health`
- PostgreSQL：Compose healthcheck 使用 `pg_isready`
- Redis：Compose healthcheck 使用 `redis-cli ping`
- MinIO：Compose healthcheck 使用 `/minio/health/live`

生产验收至少需要：

```bash
npm run prod:status
npm run prod:smoke
```

## 9. 注意事项

- 不要在生产库上执行 `db:seed`、`test:db:reset` 或任何 reset 类命令。
- `.env.production` 不应提交到 Git。
- `JWT_SECRET` 更换会让已有登录会话失效。
- `JWT_TTL_HOURS` 控制登录 token 有效期，默认 12 小时；缩短会话时间会提升安全性，但用户需要更频繁登录。
- `PUBLIC_API_BASE_URL` 是前端生产构建时使用的 API 地址，变更后需要重新构建 Web 镜像。
