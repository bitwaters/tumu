# 生产环境部署问题复盘

本文记录本项目首次部署到生产服务器过程中遇到的问题、根因、处理方式和后续标准操作。文中的服务器目录、仓库地址、主机名和账号信息均使用占位符，不记录真实生产敏感信息。

## 最终部署状态

- 代码仓库：`<GIT_REPOSITORY_URL>`
- 部署方式：服务器项目目录下直接执行 `docker compose`
- Compose 文件：项目根目录 `docker-compose.yml`
- 环境变量文件：项目根目录 `.env`
- Web 访问地址：`http://<SERVER_HOST_OR_IP>:8080`
- API 地址：`http://<SERVER_HOST_OR_IP>:4000`
- 数据存储目录：项目目录下 `data/`

当前数据目录结构：

```text
<PROJECT_DIR>/data/postgres
<PROJECT_DIR>/data/redis
<PROJECT_DIR>/data/minio
```

其中：

- `data/postgres`：PostgreSQL 数据库数据
- `data/redis`：Redis 数据
- `data/minio`：照片和附件对象存储数据

## 部署中遇到的问题

### 1. 根目录没有 Docker Compose 文件

**现象**

用户希望使用 Docker Compose 一键部署，但最初根目录看不到 compose 文件。

**根因**

生产 Compose 文件原本位于：

```text
infra/docker-compose.prod.yml
```

根目录没有直观入口，部署时容易找不到。

**处理**

新增根目录：

```text
docker-compose.yml
```

并把生产脚本和文档默认入口切换到根目录 Compose。

### 2. GitHub CLI 显示不可用

**现象**

Codex 侧边栏显示 `GitHub CLI 不可用`。

**根因**

本机当时没有安装 `gh`，并且 Codex App 启动时没有读取到新安装后的 PATH。

**处理**

通过 Homebrew 安装并登录：

```bash
brew install gh
gh auth login
gh auth setup-git
```

随后成功推送代码到 GitHub。

### 3. 服务器执行 npm 命令失败

**现象**

服务器上执行：

```bash
npm run prod:init-env -- --host <SERVER_HOST_OR_IP>
```

报错：

```text
npm: command not found
```

**根因**

服务器宿主机没有安装 Node.js/npm。使用 1Panel 或直接 Docker Compose 部署时，宿主机其实不一定需要 npm，因为 npm 会在 Docker 镜像构建阶段在容器内运行。

**处理**

改为在项目根目录手动创建 `.env` 文件，不依赖宿主机 npm 生成生产环境变量。

### 4. 1Panel 与命令行 Compose 的差异

**现象**

部署时一开始不确定是否必须使用 1Panel 的“容器编排”。

**结论**

不必须。1Panel 的容器编排本质上也是执行 Docker Compose。项目可以直接在目录下执行：

```bash
cd <PROJECT_DIR>
docker compose up -d --build
```

但不能只用单个 `docker run`，因为项目由多个服务组成：

```text
web
api
postgres
redis
minio
```

### 5. 生产环境变量文件需要手动准备

**现象**

需要随机生成数据库密码、MinIO 密钥、JWT 密钥等。

**处理**

生成 `.env` 文件，并在服务器项目目录放置：

```text
<PROJECT_DIR>/.env
```

关键配置包括：

```env
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
DATA_ROOT=./data

POSTGRES_DB=site_management
POSTGRES_USER=site_user
POSTGRES_PASSWORD=生产强密码

PUBLIC_API_BASE_URL=http://<SERVER_HOST_OR_IP>:4000
PUBLIC_WEB_BASE_URL=http://<SERVER_HOST_OR_IP>:8080
API_CORS_ORIGIN=http://<SERVER_HOST_OR_IP>:8080

S3_ACCESS_KEY=生产随机值
S3_SECRET_KEY=生产随机值
JWT_SECRET=生产随机值
```

`.env` 包含真实密钥，已被 `.gitignore` 忽略，不应提交到 Git。

### 6. Docker 默认数据卷空间不足

**现象**

Docker 默认 volume 存储空间不足，需要迁移数据位置。

**根因**

最初 PostgreSQL、Redis、MinIO 使用 Docker named volume，默认存储在 Docker 的数据目录，例如：

```text
/var/lib/docker/volumes
```

**处理**

将 `docker-compose.yml` 改为目录挂载，并支持：

```env
DATA_ROOT=./data
```

现在数据默认存储在项目当前目录：

```text
<PROJECT_DIR>/data/postgres
<PROJECT_DIR>/data/redis
<PROJECT_DIR>/data/minio
```

后续如果要迁移到其他磁盘，只需要修改 `.env`：

```env
DATA_ROOT=/data/tumu
```

### 7. Docker 构建时 npm ci 网络中断

**现象**

构建 API/Web 镜像时多次出现：

```text
npm ERR! code ECONNRESET
npm ERR! network aborted
```

**根因**

服务器访问 npm 官方源不稳定，容器内执行 `npm ci` 时网络连接中断。

**处理**

在 Dockerfile 和 Compose 中增加 npm 镜像源支持：

```env
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
```

并在 Dockerfile 中增加：

```text
NPM_CONFIG_REPLACE_REGISTRY_HOST=always
NPM_CONFIG_FETCH_RETRIES=5
NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
```

同时构建时会打印当前 registry，方便确认是否使用镜像源。

服务器重新构建建议使用：

```bash
docker compose build --no-cache api web
docker compose up -d
```

### 8. Prisma 迁移缺少 datasource.url

**现象**

执行数据库迁移时出现：

```text
The datasource.url property is required in your Prisma config file when using prisma migrate deploy.
```

**根因**

项目中存在：

```text
apps/api/prisma.config.ts
```

但 API Docker runtime 镜像中没有复制该文件，导致 `prisma migrate deploy` 找不到 datasource 配置。

**处理**

修改 `infra/docker/api.Dockerfile`，在 build/runtime 阶段都复制：

```dockerfile
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
```

重新构建 API 镜像后，迁移成功执行。

### 9. 数据库迁移成功后仍无法登录

**现象**

网站页面可以打开，但默认账号登录提示：

```text
Invalid credentials
```

**根因**

数据库迁移只创建表结构，不会写入默认用户。

**处理**

首次空库部署后，需要执行演示 seed：

```bash
docker compose exec api npm --workspace @site-management/api run prisma:seed
```

执行 seed 前，`.env` 必须配置 `SEED_DEMO_PASSWORD`，或分别配置 `SEED_ADMIN_PASSWORD`、`SEED_USER_PASSWORD`。生产环境不再允许使用固定默认密码写入演示账号。

默认演示账号：

```text
管理员：admin / <DEMO_INITIAL_PASSWORD>
监理：wang.supervisor / <DEMO_INITIAL_PASSWORD>
施工负责人：li.manager / <DEMO_INITIAL_PASSWORD>
整改人：zhao.fix / <DEMO_INITIAL_PASSWORD>
```

注意：`prisma:seed` 会清空并重写演示数据。正式录入数据后，不要随意再次执行。演示初始密码只应保存在受控交付记录中，首次登录后必须立即修改。

### 10. 后台修改账号密码是否永久保存

**结论**

是永久保存。

当前 API 使用 Prisma/PostgreSQL，后台修改用户、密码、事项等数据会写入 PostgreSQL：

```text
<PROJECT_DIR>/data/postgres
```

照片和附件对象文件写入 MinIO：

```text
<PROJECT_DIR>/data/minio
```

重启容器或执行 `docker compose down` 不会删除这些目录数据。

## 当前推荐部署流程

首次部署或重建服务器时，推荐顺序如下：

```bash
cd <PROJECT_PARENT_DIR>
git clone <GIT_REPOSITORY_URL>
cd <PROJECT_DIR>
```

创建 `.env`，确认至少包含：

```env
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
DATA_ROOT=./data
POSTGRES_PASSWORD=生产强密码
S3_ACCESS_KEY=生产随机值
S3_SECRET_KEY=生产随机值
JWT_SECRET=生产随机值
PUBLIC_API_BASE_URL=http://<SERVER_HOST_OR_IP>:4000
PUBLIC_WEB_BASE_URL=http://<SERVER_HOST_OR_IP>:8080
API_CORS_ORIGIN=http://<SERVER_HOST_OR_IP>:8080
SEED_DEMO_PASSWORD=演示账号临时初始密码
```

启动容器：

```bash
docker compose up -d --build
```

执行迁移：

```bash
docker compose run --rm api npm --workspace @site-management/api run prisma:migrate
docker compose restart api
```

如为空库且需要默认演示账号：

```bash
docker compose exec api npm --workspace @site-management/api run prisma:seed
```

执行前必须确认容器环境中已有 `SEED_DEMO_PASSWORD`，或同时已有 `SEED_ADMIN_PASSWORD` 和 `SEED_USER_PASSWORD`；禁止使用固定弱口令作为演示账号初始密码。

访问：

```text
http://<SERVER_HOST_OR_IP>:8080
```

## 后续更新流程

代码更新后：

```bash
cd <PROJECT_DIR>
git pull
docker compose build --no-cache api web
docker compose up -d
docker compose run --rm api npm --workspace @site-management/api run prisma:migrate
docker compose restart api
```

如果只是重启：

```bash
docker compose restart api web
```

## 日常检查命令

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f postgres
```

检查健康接口：

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:8080/health
```

查看数据目录：

```bash
ls -lah <PROJECT_DIR>/data
```

## 重要注意事项

- 不要把 `.env` 提交到 Git。
- 不要在已有真实数据后随意执行 `prisma:seed`。
- 正常停止用 `docker compose down`，不要随意使用 `docker compose down -v`。
- 改了 `PUBLIC_API_BASE_URL` 后，需要重新构建 Web 镜像。
- 改了 `JWT_SECRET` 后，已有登录会话会失效。
- 生产数据应定期备份，至少备份 `data/` 和 `.env`。

简单备份命令：

```bash
cd <PROJECT_DIR>
tar -czf tumu-data-backup-$(date +%Y%m%d-%H%M%S).tar.gz data .env
```
