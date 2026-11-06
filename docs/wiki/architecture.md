---
id: architecture
title: 架构与数据流
order: 1
summary: 说明服务端、浏览器状态、领域规则和 PostgreSQL 的职责。
---

# 架构与数据流

## 账本如何载入

根路径 `/` 跳转到 `/ledger`。账本路由组 `(book)` 的共享布局在服务端读取会话，未登录跳转 `/login`；已登录按用户 ID 读取其账本，再把初始快照交给 `BookApp`。业务日期按 Asia/Shanghai 生成。用户通过 OIDC 账号中心登录，每个用户只有一个个人账本；首次登录创建空账本和预设分类，详见[身份与权限](identity.md)。

| 边界 | 职责与关键入口 |
| --- | --- |
| 页面与 API | `src/app/` 负责页面、登录回调、会话校验与 HTTP 错误 |
| 浏览器状态 | `store.ts` 接入 React；`book-store.ts` 负责保存、刷新与竞态处理 |
| 业务规则 | `commands.ts` 分发命令；`ledger.ts` 构造分录、计算余额和报销；`categories.ts` 提供分类模型 |
| 导入 | `src/features/import/` 在浏览器解析与预览，确认后走统一账本命令 |
| 持久化 | `repository.ts` 按登录用户读取账本，在数据库事务中执行命令并保存差异 |
| 数据库 | `src/db/schema.ts` 定义表结构；`drizzle/` SQL 包含数据迁移和延迟约束 |

浏览器提交的是命令，不是可直接落库的完整账本或分录。服务端验证请求后，读取当前账本重新执行规则，原子保存交易、分录、导入记录和版本。详见[保存与同步](synchronization.md)。

## 页面与 URL

业务页面使用 Next.js 文件路由：`/ledger`（账目）、`/accounts`（账户）、`/imports`（账单导入）、`/categories`（分类管理）。`/login` 与 `/wiki/[[...slug]]` 独立于账本布局。登录成功进入 `/ledger`，根路径只负责跳转；不再用 `?page=` 选择业务页面。

`(book)/layout.tsx` 持有账本快照、保存与刷新订阅、共享导航和弹窗。客户端切换业务页面复用布局，页面内容按路由挂载和卸载；导入页与分类页不再通过隐藏 DOM 常驻。记账、账户编辑、报销和详情属于当前工作区的弹窗交互，暂存表单不写进 URL。

| URL 状态 | 规则 |
| --- | --- |
| `/ledger?month=2026-11` | 所选月份；缺省或非法值使用业务日期所在月份 |
| `scope=all` | 全部时间；缺省为所选月份 |
| `type=expense` | `expense`、`income`、`transfer`、`pending`；缺省为全部，待报销始终跨月 |
| `account`、`category`、`q` | 账户 ID、分类 ID、搜索关键词；空值省略 |
| `/categories?kind=income` | 收入分类；缺省为支出分类 |

筛选值以 URL 为准，复制地址、刷新和历史导航可恢复筛选。筛选只在浏览器执行，使用 Next.js 支持的原生 History API，不重新加载服务端账本；一次筛选操作写入一条历史，搜索输入替换当前条目。账户页的“查看账目”链接进入 `/ledger?scope=all&account=…`。敏感文件内容、密码和导入核对数据不进入 URL。

离开未保存表单或导入核对时确认放弃；取消保留当前页面和 URL，确认后进行客户端导航。浏览器前进、后退先恢复当前历史条目，再等待确认；刷新或离开文档使用浏览器的未保存提示。记账弹窗进入分类管理时由共享布局保留，使用“返回记账”继续填写。

## 快照与存储的区别

数据库中用户关联账本，账本关联账户、分类、交易和导入批次。交易关联两条分录；报销回款关联原垫付交易。来源去重记录独立于交易生命周期，详见[账单导入](bill-import.md)。

浏览器的 `Book.version = 1` 是数据格式版本；`revision` 才是每次写入递增的并发版本；`ownerId` 是应用用户 ID。读取时排除数据库内 `opening` 交易，将账户期初值与后续交易分录组成快照，因此不能再把期初分录叠加一次。

首屏和发生变化后的同步都返回完整账本。聚合使用线性扫描，数据库读取分录通过交易关联查询避免大批 ID 参数；当前没有分页或增量同步协议。性能测量见[开发与验证](development.md)。

## Wiki 阅读边界

`/wiki` 使用独立服务端阅读布局，复用当前会话，授权后读取 `docs/wiki/` 并解析 Markdown。不会挂载账本状态或启动账本刷新。网页与仓库共享同一份内容、链接和锚点契约；构建时校验内容，运行时请求只查询已验证的主题索引，不根据 URL 拼接文件路径。维护方式见[开发与验证](development.md)。

## 实现依据

- [首页](../../src/app/page.tsx)、[账本布局](../../src/app/(book)/layout.tsx)、[账本界面](../../src/features/book/book-app.tsx)、[URL 规则](../../src/features/book/routes.ts)。
- [状态接入](../../src/features/book/store.ts)、[浏览器状态](../../src/features/book/book-store.ts)、[仓储](../../src/features/book/repository.ts)、[数据库结构](../../src/db/schema.ts)。
