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

`pnpm check` 依次运行 lint、类型检查、业务单元测试、备份单元测试和生产构建。`pnpm test` 覆盖金额、账户、交易、分类、导入、同步竞态、账号切换、日志脱敏及大账本汇总。`pnpm test:backup` 不连接真实数据库，验证失败保护、保留策略、权限及文件名冲突。

`pnpm bench` 输出 1000、10000、100000 笔的聚合耗时和 JSON 大小，用于测量完整快照同步的代价，不代表生产容量或延迟承诺。

`pnpm test:integration` 使用当前 Docker context，可用 `YU_TEST_DOCKER_CONTEXT` 指定。它仅读取 `compose.ci.yaml`，创建唯一命名隔离项目，不读取正式环境配置、不发布端口、不使用正式网络和数据卷，结束后清理自己的容器与卷。覆盖认证与隔离、并发版本、分类迁移、导入撤销、500 笔批量导入、超过 65535 笔的账本读写、条件同步和完整备份恢复。

集成执行顺序见 `scripts/run-integration-suites.sh`：分类迁移测试、基础集成、导入集成、大账本测试。`test-import.mjs` 依赖基础集成先建立测试用户和账户，不应脱离前置条件连接任意库运行。

GitHub Actions 的 push / pull request 工作流包含质量检查、基准与隔离集成。配置存在不等于本次已经执行或通过；交付时说明实际运行的检查。

## 保留的手动测试环境

`compose.test.yaml` 是基于正式 Compose 的显式测试覆盖文件，使用独立 `yu-test` 项目和 `yu_test` 数据库，另含 RSA 签名的模拟 OIDC 服务；生产 runner 镜像不包含该服务。

如需使用此方式，`.env.nas.test` 配置独立数据库账号密码、`APP_ORIGIN=http://localhost:3101`、`OIDC_ISSUER=http://mock-oidc:3102`、`OIDC_CLIENT_ID=yu-test` 和随机测试密钥，并提供用于 Compose 插值的 `APP_HOST=book.example.com`、`TRAEFIK_CERT_RESOLVER=test`（此环境禁用 Traefik 路由）。只能在独立环境使用，集成脚本按全新测试库执行一次。

```bash
docker --context nas compose --env-file .env.nas build
docker --context nas compose -p yu-test -f compose.yaml -f compose.test.yaml --env-file .env.nas.test build mock-oidc
docker --context nas compose -p yu-test -f compose.yaml -f compose.test.yaml --env-file .env.nas.test up -d --no-build --wait
docker --context nas compose -p yu-test -f compose.yaml -f compose.test.yaml --env-file .env.nas.test exec -T app node --input-type=module < scripts/integration.mjs
```

日常自动验证优先使用不读取正式配置的 `pnpm test:integration`。手动环境结束后仅清理对应测试项目的容器与卷。

## Wiki 维护

README 负责项目介绍、运行入口和导航，Wiki 保存当前业务与工程知识，助手规范保留在 AGENTS.md，历史过程留在 Git。修改导致已有事实失效时同步对应主题；新增长期机制优先补入原主题。局部样式与等价重构无需机械更新 Wiki。

主题沿用 `docs/wiki/`，Markdown 用相对 `.md` 链接，页面 frontmatter 使用唯一 `id`、`title`、`summary`，`order` 控制导航顺序，可选 `related` 与 `aliases` 表达关联和旧地址。增删主题时同步首页导航。

登录后访问 `/wiki`，或点击全站顶部“项目 Wiki”（也可从“账本与设置”进入）；页面读取同一份 Markdown，支持主题导航、本页目录、表格和代码块。鉴权成功后才读取索引和正文，所有登录用户均可阅读同一份项目知识；登录流程保持原有返回账本行为，登录后可重新进入 Wiki 地址。

`pnpm wiki:check` 使用 Markdown AST 检查标题、页面、中文及重复标题锚点、参考式链接、关联和别名冲突，拒绝路径越界、符号链接与危险协议。该检查作为 `pnpm build` 的前置步骤进入现有 CI。构建追踪与 Docker runner 均包含 `docs/wiki/`。

Wiki 内相对链接转成 `/wiki` 地址；仓库外部引用仅按 `src/features/wiki/repository-files.json` 的明确白名单转换为 GitHub 源码链接，应用不提供源码文件下载。添加来源引用时更新白名单并运行校验，白名单仅记录已提交的公开文件。当前不支持嵌入图片或 Mermaid；Markdown 原始 HTML 不执行。

## 工具与验证依据

[开发数据库](../../compose.dev.yaml)、[自动集成入口](../../scripts/test-integration.sh)、[集成 Compose](../../compose.ci.yaml)、[手动测试覆盖](../../compose.test.yaml)、[测试顺序](../../scripts/run-integration-suites.sh)、[迁移校验](../../scripts/test-category-migration.mjs)、[基准](../../scripts/bench-book.ts)、[CI](../../.github/workflows/ci.yml)。

