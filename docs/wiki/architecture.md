---
id: architecture
title: 架构与数据流
summary: 说明服务端、浏览器状态、领域规则和 PostgreSQL 的职责。
---

# 架构与数据流

## 账本如何载入

首页在服务端读取会话，未登录跳转 `/login`；已登录按用户 ID 读取其账本，再把初始快照交给 `BookApp`。业务日期按 Asia/Shanghai 生成。用户通过 OIDC 账号中心登录，每个用户只有一个个人账本；首次登录创建空账本和预设分类，详见[身份与权限](identity.md)。

| 边界 | 职责与关键入口 |
| --- | --- |
| 页面与 API | `src/app/` 负责页面、登录回调、会话校验与 HTTP 错误 |
| 浏览器状态 | `store.ts` 接入 React；`book-store.ts` 负责保存、刷新与竞态处理 |
| 业务规则 | `commands.ts` 分发命令；`ledger.ts` 构造分录、计算余额和报销；`categories.ts` 提供分类模型 |
| 导入 | `src/features/import/` 在浏览器解析与预览，确认后走统一账本命令 |
| 持久化 | `repository.ts` 按登录用户读取账本，在数据库事务中执行命令并保存差异 |
| 数据库 | `src/db/schema.ts` 定义表结构；`drizzle/` SQL 包含数据迁移和延迟约束 |

浏览器提交的是命令，不是可直接落库的完整账本或分录。服务端验证请求后，读取当前账本重新执行规则，原子保存交易、分录、导入记录和版本。详见[保存与同步](synchronization.md)。

## 快照与存储的区别

数据库中用户关联账本，账本关联账户、分类、交易和导入批次。交易关联两条分录；报销回款关联原垫付交易。来源去重记录独立于交易生命周期，详见[账单导入](bill-import.md)。

浏览器的 `Book.version = 1` 是数据格式版本；`revision` 才是每次写入递增的并发版本；`ownerId` 是应用用户 ID。读取时排除数据库内 `opening` 交易，将账户期初值与后续交易分录组成快照，因此不能再把期初分录叠加一次。

首屏和发生变化后的同步都返回完整账本。聚合使用线性扫描，数据库读取分录通过交易关联查询避免大批 ID 参数；当前没有分页或增量同步协议。性能测量见[开发与验证](development.md)。

## 实现依据

- [首页](../../src/app/page.tsx)、[账本界面](../../src/features/book/book-app.tsx)。
- [状态接入](../../src/features/book/store.ts)、[浏览器状态](../../src/features/book/book-store.ts)、[仓储](../../src/features/book/repository.ts)、[数据库结构](../../src/db/schema.ts)。
