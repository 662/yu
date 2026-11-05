---
id: project-wiki
title: 项目 Wiki
order: 0
summary: 理解年年有鱼的记账规则、系统边界与运行维护。
---

# 项目 Wiki

这里记录由当前实现和配置支持的项目知识，适合项目维护者与 AI 按任务查阅。使用方法与快速启动见[项目 README](../../README.md)。

## 从任务开始

| 想解决的问题 | 阅读主题 |
| --- | --- |
| 理解请求如何到达数据库、用户账本如何隔离 | [架构与数据流](architecture.md) |
| 修改余额、收支、报销或分类规则 | [记账与分类规则](ledger.md) |
| 配置登录、理解用户隔离或排查回调问题 | [身份与权限](identity.md) |
| 理解保存冲突、跨设备刷新和网络失败 | [保存与同步](synchronization.md) |
| 导入账单、判断重复、撤销批次 | [账单导入](bill-import.md) |
| 部署、升级迁移、备份和恢复 | [运行与恢复](operations.md) |
| 选择测试、修改数据库或定位实现 | [开发与验证](development.md) |

## 事实边界

Wiki 描述仓库当前机制，不证明线上部署成功或真实账单全部兼容。配置字段以脱敏环境示例为准，命令以 `package.json` 为准，字段与数据库约束以 schema 和 SQL 迁移为准。各主题提供对应源码与测试入口。

现有文档继续各司其职：[迁移目录说明](../../drizzle/README.md)索引迁移，[导入研究资料](../bill-import-research.md)保留格式来源与研究依据；贡献约束见 [AGENTS.md](../../AGENTS.md)。
