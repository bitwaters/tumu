# 生产部署手册

本文档面向项目内网单服务器或单 VM 部署。生产部署使用 Docker Compose 管理 Web、API、PostgreSQL、Redis 和 MinIO。

## 1. 前置条件

- Linux 服务器已安装 Docker Engine 和 Docker Compose plugin。
- 服务器能访问项目代码或发布包。
- 已规划持久化磁盘和备份目录，例如 `/var/backups/site-management`。
- 已准备可长期保存的生产密钥，不能使用 `.env.production.example` 中的 `CHANGE_ME` 示例值。

## 2. 首次部署

1. 复制环境模板：

```bash
cp .env.production.example .env.production
```

2. 编辑 `.env.production`，至少替换：

- `POSTGRES_PASSWORD`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `JWT_SECRET`
- `PUBLIC_API_BASE_URL`
- `PUBLIC_WEB_BASE_URL`
- `BACKUP_DIR`
- `SMOKE_USERNAME`
- `SMOKE_PASSWORD`

3. 准备备份目录：

```bash
sudo mkdir -p /var/backups/site-management
sudo chown "$USER":"$USER" /var/backups/site-management
```

4. 运行预检查：

```bash
npm run prod:preflight
```

5. 构建生产镜像：

```bash
npm run prod:build
```

6. 启动数据库、缓存、对象存储和应用：

```bash
npm run prod:up
```

7. 执行数据库迁移：

```bash
npm run prod:migrate
```

8. 查看服务状态：

```bash
npm run prod:status
```

9. 运行上线烟测：

```bash
npm run prod:smoke
```

10. 记录上线信息：

```bash
git rev-parse HEAD
docker compose --env-file .env.production -f infra/docker-compose.prod.yml ps
```

## 3. 日常启动与停止

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
docker compose --env-file .env.production -f infra/docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f infra/docker-compose.prod.yml logs -f web
```

## 4. 升级流程

1. 确认最近一次数据库和对象存储备份可用。
2. 拉取或切换到新版本代码。
3. 运行：

```bash
npm run prod:preflight
npm run prod:build
npm run prod:migrate
npm run prod:up
npm run prod:smoke
```

4. 记录升级后的 Git commit、镜像 tag、迁移时间和烟测结果。

## 5. 回滚流程

应用代码回滚：

1. 切回上一版 Git commit 或镜像 tag。
2. 重新构建并启动：

```bash
npm run prod:build
npm run prod:up
npm run prod:smoke
```

数据回滚必须谨慎处理。只有在确认需要恢复数据时，才按 [backup-restore.md](/Users/yang/Documents/project123/docs/backup-restore.md) 执行数据库和对象存储恢复。

## 6. 健康检查

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

## 7. 注意事项

- 不要在生产库上执行 `db:seed`、`test:db:reset` 或任何 reset 类命令。
- `.env.production` 不应提交到 Git。
- `JWT_SECRET` 更换会让已有登录会话失效。
- `PUBLIC_API_BASE_URL` 是前端生产构建时使用的 API 地址，变更后需要重新构建 Web 镜像。
