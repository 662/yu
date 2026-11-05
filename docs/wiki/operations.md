---
id: operations
title: 运行与恢复
order: 6
summary: 记录容器部署、数据库迁移、健康检查、备份和恢复条件。
---

# 运行与恢复

本页命令描述仓库现有部署约定；执行前确认目标 context 与环境文件。

## 容器部署与备份

部署 Compose 连接外部 `traefik_default` 网络，需事先创建网络并配置 Traefik。通过 `APP_HOST` 设置自己的域名，通过 `TRAEFIK_CERT_RESOLVER` 指定已配置的证书解析器；外部 HTTPS 端口由部署环境决定，应用内部使用 3000。
数据库使用命名卷 `yu_postgres_data`，PostgreSQL 18 挂载到 `/var/lib/postgresql`；数据库和迁移服务禁用 Traefik 路由。
项目通过构建上下文打包进镜像，不挂载本机源码。以下 `nas` 为远程 Docker context 的示例名称，请替换为自己的 context。

`.env.nas` 同时包含 POSTGRES_DB/USER/PASSWORD、DATABASE_URL 及[身份与权限](identity.md)中的 OIDC 设置。
DATABASE_URL 的主机为 `db`；更新时保留已有数据库密码，不要用示例覆盖。

```bash
bash scripts/backup.sh
docker --context nas compose --env-file .env.nas up -d --build --wait --wait-timeout 180
docker --context nas compose --env-file .env.nas ps -a
curl -f https://book.example.com/api/ready
```

启动顺序：数据库健康 → SQL 迁移成功 → 应用启动。`down` 保留数据，`down -v` 删除数据库。
备份为 `.backups/` 下的完整 pg_dump 文件，目录与文件仅当前用户可读；支持每日自动备份、保留策略和每周隔离恢复验证，配置见本页定期备份部分。
JSON 导出包含当前用户账本及导入记录，不等同于数据库备份。

## 定期备份与恢复演练

调度主机需要 Bash、Python 3、`flock`、Docker CLI，以及连接 NAS context 的权限。调度主机应持续开机，备份目录应位于与 NAS 数据盘不同的机器或磁盘。

```bash
cp .env.backup.example .env.backup
# 编辑备份位置、Docker context、保留天数；配置文件使用 Bash 语法。
YU_VERIFY_BACKUP=true pnpm backup
pnpm backup:schedule
```

调度器保留已有 cron 任务，仅安装或更新本项目的条目：每天调度主机时区 03:15 执行备份，默认保留 30 天，每周日自动恢复验证。
日志位于 `.backups/backup.log`；通过 `crontab -l` 查看任务，删除带 `yu-backup-` 标记的对应行可取消。
备份先写临时文件、验证归档后原子发布；发生错误时退出非零且不删除旧备份。备份目录权限为 700，文件为 600；并发任务由文件锁阻止。

单独验证任意备份：

```bash
pnpm backup:verify .backups/yu-某次备份.dump
```

恢复演练创建一个全新的 PostgreSQL 18 容器，不接入任何网络、无主机端口；完整执行 `pg_restore`，再检查分录完整性与平衡，最后自动删除容器和临时卷。演练不会覆盖正式库。
若需要灾后恢复，应先停止账本写入，保留当前库的额外备份，再将选中的归档恢复到新数据库并验证，最后切换 `DATABASE_URL`。不要直接覆盖唯一的正式数据库副本。

## 升级与迁移

启动依赖为数据库健康、迁移服务成功、应用启动。迁移由 `scripts/migrate.ts` 读取 Drizzle journal 执行，不要修改已执行迁移。先备份，再审查 SQL，最后升级。

| 迁移 | 对已有数据的影响 |
| --- | --- |
| 0000 | 初期单人结构与延迟平衡约束 |
| 0001 | 开发期多用户切换，删除旧单人账本、会话和本地密码账号；需要保留旧数据的环境不能直接执行 |
| 0002 | 按账本补预设分类、保留历史 ID，未知历史分类停用迁入；不改写交易、分录、账户或版本 |
| 0003 | 新增导入批次和来源去重记录，不改写已有账目 |

## 健康检查与故障定位

`/api/health` 只表示进程存活；`/api/ready` 实际执行 `SELECT 1`，只能证明当前数据库连接可用，不能证明 OIDC 或所有业务约束正常。`/api/book` 必须登录。

| 现象 | 定位与恢复 |
| --- | --- |
| 应用未启动 | 查看 Compose 的 db、migrate、app 状态和日志；迁移失败时先查 SQL 与连接，不绕过迁移依赖 |
| ready 返回 503 | 检查数据库健康、DATABASE_URL 与网络；连接池会记录空闲连接错误，后续请求可重新建立连接 |
| 登录失败 | 按[身份与权限](identity.md)核对 issuer、回调、客户端密钥及容器和浏览器可达性 |
| 保存冲突或网络失败 | 按[保存与同步](synchronization.md)刷新核对，避免重复提交 |
| 自动备份失败 | 检查调度主机开机、context 权限、备份日志、磁盘与锁；归档失败不会清理旧备份 |

经统一 `apiError` 返回的错误包含 `X-Request-Id` 和 JSON `requestId`，可关联服务端结构化日志。日志记录事件、位置与数据库错误码，不记录异常消息、SQL、绑定参数、正文、Cookie 或 OIDC 回调查询参数。专门构造的冲突响应和 readiness 响应不保证有此编号。

## 配置与脚本依据

[部署 Compose](../../compose.yaml)、[镜像构建](../../Dockerfile)、[部署变量示例](../../.env.production.example)、[备份变量示例](../../.env.backup.example)、[迁移入口](../../scripts/migrate.ts)、[迁移说明](../../drizzle/README.md)。

[备份](../../scripts/backup.sh)、[恢复验证](../../scripts/verify-backup.sh)、[cron 安装](../../scripts/install-backup-cron.py)、[日志脱敏](../../src/lib/logging.ts)、[健康检查](../../src/app/api/ready/route.ts)。

