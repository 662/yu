<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 项目知识维护

项目 Wiki 入口为 [docs/wiki/index.md](docs/wiki/index.md)，按任务阅读相关主题。业务规则、数据隔离、同步、导入或运行机制变更导致已有说明失效时，同步修正对应主题及引用；新增知识依据当前实现和相关测试，优先更新已有主题。局部样式或等价重构无需机械追加文档，验证结果只报告实际执行的检查。

## 交付与发布

任务完成并通过必要验证后，主动提交并推送；用户明确要求暂不提交或推送时遵从用户要求。推送 main 后由 CI 检查并发布测试镜像；面向 main 的 PR 只检查和构建，不推送镜像。正式镜像仅在维护者主动发布正式 GitHub Release 时构建，不因任务完成自动创建 Release 或 tag。

日常交付通过 GitHub CI 构建、发布镜像，部署端自行定时获取成功 main CI 对应的镜像并更新；不再从开发机使用 Docker CLI 构建或部署私有服务器。只有用户明确要求维护部署环境时才连接服务器操作。私有环境的定时器、更新脚本、状态与凭据留在部署端，不写入公开仓库。提交前检查待提交内容，推送后核对 CI 与镜像发布结果；失败时如实说明失败环节，不将未执行或未验证的步骤报告为成功。

## 公开仓库与隐私

这是公开 GitHub 仓库。代码、文档、提交信息及发布说明只保留项目通用机制和必要的可复用知识；示例使用明确的占位值，不把维护者个人环境当作其他用户的部署前提。

真实环境文件、密钥、令牌、内部地址、私人域名、个人路径、账号和账本数据，以及包含这些内容的日志、截图与备份，不得提交或附到公开发布中。私有部署拓扑、机器信息和运维参数留在本地被 Git 忽略的配置中。提交前检查暂存区及新增文件，公开材料不记录私有环境的验证细节。
