# 备份与恢复手册

本文档覆盖生产 PostgreSQL 数据库和 MinIO 对象存储的备份、恢复和验证。

## 1. 备份频率建议

- PostgreSQL：每日一次，重要上线前额外执行一次。
- MinIO 对象存储：每日一次，重要上线前额外执行一次。
- 保留策略：至少保留最近 30 天；项目关键节点可额外长期归档。
- 恢复演练：至少每月一次，且每次重大版本上线前执行一次恢复验证。

## 2. 数据库备份

确认 `.env.production` 中 `BACKUP_DIR` 存在且可写，然后执行：

```bash
npm run backup:db
```

脚本会生成类似：

```text
/var/backups/site-management/postgres-site_management-20260703T120000Z.dump
```

验收标准：

- 文件存在。
- 文件大小大于 0。
- 备份时间、操作者、Git commit 和文件路径被记录到运维台账。

## 3. 对象存储备份

执行：

```bash
npm run backup:objects
```

脚本会从 Compose MinIO 数据卷导出配置的 `S3_BUCKET`，生成类似：

```text
/var/backups/site-management/minio-site-management-20260703T120000Z.tar.gz
```

验收标准：

- 文件存在。
- 文件大小大于 0。
- 文件名中包含 bucket 和 UTC 时间戳。

## 4. 数据库恢复

数据库恢复必须指定目标数据库，不允许隐式覆盖生产库。

```bash
RESTORE_DATABASE_URL='postgresql://user:password@host:5432/site_management_restore' \
RESTORE_CONFIRM=RESTORE_DATABASE \
npm run restore:db -- /var/backups/site-management/postgres-site_management-20260703T120000Z.dump
```

恢复完成后运行：

```bash
npm run prod:smoke
```

如果要恢复到生产库，必须先停机、确认业务窗口、确认对象存储备份版本一致，并记录审批依据。

## 5. 对象存储恢复

对象恢复会写入 `.env.production` 指向的 MinIO bucket，必须显式确认：

```bash
RESTORE_CONFIRM=RESTORE_OBJECTS \
npm run restore:objects -- /var/backups/site-management/minio-site-management-20260703T120000Z.tar.gz
```

恢复后检查：

- MinIO bucket 中对象数量符合预期。
- 事项详情中的照片可以预览。
- `npm run prod:smoke` 通过。

## 6. 恢复演练记录

每次恢复演练至少记录：

- 演练日期。
- 操作人。
- 数据库备份文件路径和大小。
- 对象备份文件路径和大小。
- 恢复目标环境。
- 烟测结果。
- 发现的问题和处理结论。

## 7. 常见失败处理

- `backup directory does not exist`：创建 `BACKUP_DIR` 并确保当前用户可写。
- `pg_dump` 或 `pg_restore` 失败：检查数据库连接、账号权限和版本兼容性。
- 对象备份为空：确认 `S3_BUCKET` 与 MinIO 数据卷中的 bucket 一致。
- 烟测登录失败：确认 `SMOKE_USERNAME` 和 `SMOKE_PASSWORD` 对应生产环境中的有效账号。
