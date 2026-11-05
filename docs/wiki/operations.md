---
id: operations
title: 运行与恢复
order: 6
summary: 记录容器部署、数据库迁移、健康检查、备份和恢复条件。
---

# 运行与恢复

部署命令在部署主机执行。日常开发通过 GitHub CI 构建并发布镜像，部署端定时拉取；开发机不再直接构建或部署私有服务器。

## 容器部署与自动更新

部署 Compose 使用 `ghcr.io/662/yu` 和 `ghcr.io/662/yu-migrator` 镜像，不再包含源码构建步骤。镜像的触发规则、地址与标签见[开发与验证](development.md#ci-与镜像发布)。

首次部署时，在独立目录放置 `compose.yaml`，从 `.env.production.example` 复制 `.env`，配置自己的数据库、OIDC 与域名。`DATABASE_URL` 的主机为 `db`；更新已有环境时保留数据库密码。部署 Compose 连接外部 `traefik_default` 网络，需事先创建并配置 Traefik。`APP_HOST` 指定域名，`TRAEFIK_CERT_RESOLVER` 指定已配置的证书解析器，应用内部端口为 3000。

数据库使用本地目录 bind mount，默认 `./postgres`，可用 `YU_POSTGRES_DIR` 指定路径。PostgreSQL 18 挂载父目录为 `/var/lib/postgresql`，实际集群位于其下的 `18/docker/`；目录必须事先存在，Compose 不自动创建。应用不挂载源码。`YU_POSTGRES_IMAGE` 可固定数据库镜像，应用更新不应顺带升级 PostgreSQL。

以下仅用于**全新数据库**的首次启动，命令在部署目录执行：

```bash
mkdir -p postgres
docker compose --env-file .env pull
docker compose --env-file .env up -d --wait --wait-timeout 180
docker compose --env-file .env ps -a
curl -f https://book.example.com/api/ready
```

已有命名卷部署不能直接套用空目录。先备份并验证，再停止应用写入和数据库，将整个数据卷根目录冷复制到本地目录，保留原有权限与 UID/GID，核对数据后再切换挂载。首次切换期间保留旧卷及备份，确认新部署正常后再单独处理；不要在数据库运行时复制数据库文件。

日常自动更新由部署端的定时任务完成，例如 systemd service + timer：

1. 查询 main 最近一次成功的 CI，以其完整提交 SHA 选择两个镜像，不分别追踪可变的 `edge` 标签。
2. 拉取两个 SHA 镜像，核对镜像 revision，并固定各自 digest；版本未变化时跳过。
3. 停止应用写入，完成备份及隔离恢复验证，执行迁移，再启动新应用。
4. 检查进程、数据库就绪、登录入口及外部访问，成功后记录版本。

更新任务应互斥，网络或拉取失败时保留当前服务。开始迁移前的失败可恢复原应用；迁移开始后若结果不明或新应用验证失败，应保留数据库、备份及失败状态，停止自动重试，待人工核对，不自动反向迁移或覆盖恢复数据库。

实际服务器的定时器、更新脚本、版本状态和凭据只保留在部署端，不提交到公开仓库。服务与迁移日志分别由部署端保留。`docker compose down` 保留本地数据库目录；JSON 导出仅包含当前用户账本及导入记录，不等同于数据库备份。

## 定期备份与恢复演练

部署端的更新前备份用于保留升级时点；另保留异机备份。仓库中的备份工具可在独立备份主机运行，需要 Bash、Python 3、`flock`、Docker CLI 及连接目标 Docker context 的权限。备份主机应持续开机，备份目录应位于与数据库不同的机器或磁盘。Docker context 在此仅用于备份与恢复验证，不用于日常部署。

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

恢复演练创建一个全新的 PostgreSQL 18 容器，不接入任何网络、无主机端口；通过容器内 TCP 探测等待正式数据库进程启动，避免误连初始化期间的临时 Unix socket 服务。完整执行 `pg_restore`，再检查分录完整性与平衡，最后自动删除容器和临时卷。演练不会覆盖正式库。
若需要灾后恢复，应先停止账本写入，保留当前库的额外备份，再将选中的归档恢复到新数据库并验证，最后切换 `DATABASE_URL`。不要直接覆盖唯一的正式数据库副本。

## 升级与迁移

启动顺序为数据库健康、迁移成功、应用启动。迁移由 `scripts/migrate.ts` 读取 Drizzle journal 执行，不要修改已执行迁移。先备份，再审查 SQL，最后升级。

0.1 以 `0000_baseline.sql` 为唯一基线，直接建立最终表结构及复式分录平衡函数、延迟约束触发器，不执行开发期的数据清空与历史回填。

全新库执行基线；已经完整执行旧 `0000`–`0003` 的库保留原迁移记录即可接续。基线 journal 时间戳沿用旧 `0003` 的 `1793726117622`，当前 Drizzle migrator 会跳过基线，之后正常执行时间戳更晚的增量迁移。发布前在目标库执行以下只读查询，确认最后时间戳与预期一致，并核对结构没有手动漂移：

```sql
SELECT created_at FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC LIMIT 1;
```

未完成旧迁移的环境先使用 Git 中合并前的版本完成迁移，再升级。不要删除已有库的迁移记录或重放基线。0.1 发布后仅追加增量迁移；详见[迁移目录说明](../../drizzle/README.md)。

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

