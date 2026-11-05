# 年年有鱼

手机与电脑都能使用的个人记账软件。通过 OIDC 账号中心登录，每个用户拥有独立账本，记录保存在 PostgreSQL。

- Next.js 16.4.3、React 19、TypeScript、Tailwind CSS 4、shadcn/ui Base UI
- Drizzle ORM、node-postgres、PostgreSQL 18
- openid-client 6、OIDC Authorization Code + PKCE
- Docker Compose、Traefik HTTPS、Node.js 24 LTS、pnpm 12.10.1

## 使用

点击“通过账号中心登录”，在账号中心登录后自动创建自己的空账本。先添加账户及当前余额，再开始记账。
账号、密码以及 Google/GitHub 等第三方登录方式均由账号中心统一管理，应用不再提供本地注册、初始化码或密码登录。

- 支出、收入、转账、信用卡还款，支持编辑与删除。
- 月度收支、分类分布、搜索与账户筛选。
- 独立的支出与收入分类管理，支持新增、重命名、图标、颜色、排序及停用。
- 银行卡、信用卡、平台余额、现金、投资总估值及余额核对。
- 垫付与分次报销；账户余额、资产、负债、净资产汇总。
- 手机底部快捷记账；同一账号在电脑和手机之间共享记录。
- 保存成功后更新界面；失败保留填写；同一账本并发写入会提示版本冲突。
- 每 30 秒及页面回到前台时检查账本版本，仅在变化时获取完整数据；支持导出当前用户的 JSON 账本记录。

暂不支持自动行情、共享账本或 JSON 恢复。

## 项目知识

[项目 Wiki](docs/wiki/index.md) 是业务规则和工程知识入口。应用内登录后访问 `/wiki`，或点击全站顶部“项目 Wiki”（也可从“账本与设置”进入）在线阅读同一份 Markdown：

- [架构与数据流](docs/wiki/architecture.md)：模块边界、用户账本、快照存储。
- [记账与分类规则](docs/wiki/ledger.md)：分录、余额、资产负债、报销与分类生命周期。
- [身份与权限](docs/wiki/identity.md)：OIDC 配置、会话和用户隔离。
- [保存与同步](docs/wiki/synchronization.md)：版本冲突、跨设备刷新和失败处理。
- [账单导入](docs/wiki/bill-import.md)：支持格式、账户映射、去重和整批撤销。
- [运行与恢复](docs/wiki/operations.md)：容器部署、迁移、备份与恢复演练。
- [开发与验证](docs/wiki/development.md)：本地开发、测试策略和文档维护。

## 本地开发

本机需要 Node.js、pnpm、Docker Engine 与 Compose。也可使用自行配置的远程 Docker context。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:up
```

编辑 `.env` 的数据库连接、APP_ORIGIN 与开发专用 OIDC 客户端信息。
数据库在本机启动时，可直接执行：

```bash
pnpm db:migrate
pnpm dev
```

使用远程 Docker 时，需要自行配置数据库隧道及 `DATABASE_URL`。生产构建不需要连接数据库或 OIDC 账号中心。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

表结构修改后执行 `pnpm db:generate`，审查 SQL 后执行 `pnpm db:migrate`，不要修改已经执行过的迁移。

部署与备份命令见[运行与恢复](docs/wiki/operations.md)，完整检查和隔离集成说明见[开发与验证](docs/wiki/development.md)。真实环境文件、密钥、会话和 `.backups/` 不纳入 Git。
