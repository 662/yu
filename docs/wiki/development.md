---
id: development
title: 开发与验证
order: 7
summary: 按变更选择实现入口、数据库迁移和隔离验证方式。
---

# 开发与验证

## 本地开发

安装、开发数据库启动、NAS 隧道和基础检查步骤统一见 [README](../../README.md)。开发数据库配置见 `compose.dev.yaml`，环境变量从 `.env.example` 复制；OIDC 身份服务使用独立开发客户端，详见[身份与权限](identity.md)。

表结构变更先修改 schema，再运行 `pnpm db:generate`，审查生成 SQL 后执行 `pnpm db:migrate`；不要修改已经执行的迁移。升级前核对[迁移影响](operations.md)。

## 修改前定位知识

先遵循 [AGENTS.md](../../AGENTS.md)。本项目使用 Next.js 16.4.3；写代码前阅读当前安装版本 `node_modules/next/dist/docs/` 对应指南，不能沿用旧版本假设。依赖和命令以 [package.json](../../package.json) 为准。

| 修改内容 | 先读主题 | 主要验证入口 |
| --- | --- | --- |
| 余额、报销、交易、分类 | [记账规则](ledger.md) | ledger、commands、categories、summary 单元测试 |
| 客户端保存、刷新、账号切换 | [保存与同步](synchronization.md) | book-store 单元测试；涉及 API 时加集成验证 |
| 登录、隔离、来源校验 | [身份与权限](identity.md) | OIDC/PostgreSQL 集成测试 |
| 解析、导入、撤销 | [账单导入](bill-import.md) | import 单元测试与 test-import 集成脚本 |
| schema、SQL、备份 | [运行与恢复](operations.md) | 迁移集成、备份单元及隔离恢复验证 |

## 检查命令与覆盖边界

`pnpm check` 依次运行 lint、类型检查、业务单元测试、备份单元测试和生产构建。`pnpm test` 覆盖金额、账户、交易、分类、导入、同步竞态、账号切换、日志脱敏及汇总一致性。`pnpm test:backup` 不连接真实数据库，验证失败保护、保留策略、权限及文件名冲突。

`pnpm bench` 输出 1000、10000、100000 笔的聚合耗时和 JSON 大小，用于测量完整快照同步的代价，不代表生产容量或延迟承诺。

`pnpm test:integration` 使用当前 Docker context，可用 `YU_TEST_DOCKER_CONTEXT` 指定。它仅读取 `compose.ci.yaml`，创建唯一命名隔离项目，不读取正式环境配置、不发布端口、不使用正式网络和数据卷，结束后清理自己的容器与卷。覆盖认证与隔离、并发版本、基线初始化与接续、导入撤销、条件同步和完整备份恢复。

集成执行顺序见 `scripts/run-integration-suites.sh`：数据库迁移、基础集成、导入集成。单元测试覆盖业务规则与异常组合，集成测试聚焦真实数据库、认证隔离、持久化、并发与恢复，不重复穷举纯业务规则。`test-import.mjs` 依赖基础集成先建立测试用户和账户，不应脱离前置条件连接任意库运行。

本地与 CI 共用 `compose.ci.yaml` 和 `pnpm test:integration`，无需维护另一套继承正式部署的手动测试环境。测试身份服务只用于隔离项目，生产 runner 不包含它。

`pnpm test:scale` 在同一隔离环境中追加 500 笔原子导入及超过 65535 笔的账本读写回归。大账本测试与 `pnpm bench` 在每周 GitHub Actions 和手动触发时执行；push / pull request 保留质量检查及核心集成。配置存在不等于本次已经执行或通过；交付时说明实际运行的检查。

## CI 与镜像发布

[CI 工作流](../../.github/workflows/ci.yml) 使用 GitHub 托管 runner，质量检查和隔离集成都成功后才允许推送镜像。日常任务完成后提交、推送，正式版本由维护者主动发布 Release；CI 不连接部署环境或自动部署。

| 触发方式 | 检查与构建 | 镜像发布 |
| --- | --- | --- |
| 面向 main 的 PR | 质量检查、核心集成，构建应用和迁移镜像 | 不推送，包括来自 fork 的 PR |
| push main | 质量检查、核心集成 | `edge`、`sha-<完整提交 SHA>` |
| 发布正式 GitHub Release | 检查 Release tag 对应的代码并构建 | `X.Y.Z`、`X.Y`、`latest` |
| 每周定时或手动运行 | 质量检查、核心集成、大账本与基准 | 不推送 |

正式 Release 使用 `vX.Y.Z` tag；草稿、预发布和单独推送 tag 不发布正式镜像。已有 Release 不会因为工作流新增而补构建，后续发布正式 Release 时才会触发。main 的滚动测试镜像不修改正式版 `latest`。

镜像地址为 `ghcr.io/662/yu`（应用）和 `ghcr.io/662/yu-migrator`（数据库迁移），提供 `linux/amd64`、`linux/arm64`。两个镜像来自同一个提交；跨镜像标签更新不具备原子性，定时获取端应等两个对应 SHA 标签都可用后再部署，或使用成功工作流摘要中的两个 digest，避免混用版本。

镜像由工作流的 `GITHUB_TOKEN` 发布，仅发布 job 获得 `packages: write`；PR 不登录 GHCR、不获取镜像写入权限，不使用 `pull_request_target` 运行贡献者代码。第三方镜像 Actions 固定到提交 SHA。

GHCR 新包默认私有，公开仓库不意味着包自动公开。首次成功推送后，维护者需在两个包的 Package settings 中分别将可见性设为 Public，才能匿名拉取。数据库连接、OIDC 密钥及其他部署配置只在部署端提供，不传入 CI 或镜像构建。各镜像 digest 记录在 Actions 摘要中，构建缓存用于后续发布加速。

## Wiki 维护

README 负责项目介绍、运行入口和导航，Wiki 保存当前业务与工程知识，助手规范保留在 AGENTS.md，历史过程留在 Git。修改导致已有事实失效时同步对应主题；新增长期机制优先补入原主题。局部样式与等价重构无需机械更新 Wiki。

主题沿用 `docs/wiki/`，Markdown 用相对 `.md` 链接，页面 frontmatter 使用唯一 `id`、`title`、`summary`，`order` 控制导航顺序，可选 `related` 与 `aliases` 表达关联和旧地址。增删主题时同步首页导航。

登录后访问 `/wiki`，或点击全站顶部“项目 Wiki”（也可从“账本与设置”进入）；页面读取同一份 Markdown，支持主题导航、本页目录、表格和代码块。鉴权成功后才读取索引和正文，所有登录用户均可阅读同一份项目知识；登录流程保持原有返回账本行为，登录后可重新进入 Wiki 地址。

`pnpm wiki:check` 使用 Markdown AST 检查标题、页面、中文及重复标题锚点、参考式链接、关联和别名冲突，拒绝路径越界、符号链接与危险协议。该检查作为 `pnpm build` 的前置步骤进入现有 CI。构建追踪与 Docker runner 均包含 `docs/wiki/`。

Wiki 内相对链接转成 `/wiki` 地址；仓库外部引用仅按 `src/features/wiki/repository-files.json` 的明确白名单转换为 GitHub 源码链接，应用不提供源码文件下载。添加来源引用时更新白名单并运行校验，白名单仅记录已提交的公开文件。当前不支持嵌入图片或 Mermaid；Markdown 原始 HTML 不执行。

## 工具与验证依据

[开发数据库](../../compose.dev.yaml)、[自动集成入口](../../scripts/test-integration.sh)、[集成 Compose](../../compose.ci.yaml)、[测试顺序](../../scripts/run-integration-suites.sh)、[迁移校验](../../scripts/test-database.mjs)、[基准](../../scripts/bench-book.ts)、[CI](../../.github/workflows/ci.yml)。

