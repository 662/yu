---
id: identity
title: 身份与权限
order: 3
summary: 说明 OIDC 配置、登录流程、会话和账本隔离边界。
---

# 身份与权限

## 身份与账本归属

用户以 OIDC `issuer + sub` 唯一识别，姓名和邮箱只作展示，邮箱相同不会合并账号。首次登录在事务中创建用户账本和默认分类；数据库对用户与账本建立一对一唯一约束。

所有账本读取、写入和版本锁均从服务端会话解析用户，再按其账本执行。客户端 `ownerId` 只是绑定当前页面账号的额外校验，不能指定要访问谁的账本。跨标签页切换账号时的清理行为见[保存与同步](synchronization.md)。

## OIDC 提供方配置

脱敏模板见 [.env.production.example](../../.env.production.example) 与 [.env.example](../../.env.example)。以下均为占位示例：issuer `https://id.example.com`，client ID `yu`；部署时替换为身份服务提供的实际值。

应用使用通用 `openid-client`，没有提供方专属 SDK。身份服务需支持 OIDC discovery、授权码流程、S256 PKCE、签名 ID Token 和 `client_secret_basic` 客户端认证。应用不使用隐式流程或密码授权。

配置使用 `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET` 和 `APP_ORIGIN`；登录入口为 `/api/auth/signin/oidc`，回调为 `/api/auth/callback/oidc`。旧提供方命名的环境变量和路由不再兼容，升级时需同步修改环境文件和身份服务回调白名单。

| 身份服务设置 | 示例值（部署时替换） |
| --- | --- |
| 登录回调 URI | `https://book.example.com/api/auth/callback/oidc` |
| 退出回调 URI | `https://book.example.com/login` |
| 应用 Origin | `https://book.example.com` |

`OIDC_ISSUER` 必须与 discovery 返回的 issuer 一致，浏览器与应用容器都需可达。`APP_ORIGIN` 用来构造回调、退出地址并校验写入来源。开发使用单独客户端和精确的本地回调，不扩大正式客户端回调范围。第三方登录、密码和账号管理由身份服务提供；应用不再保留旧 `/setup`、`/password` 页面。

## 登录与会话

登录开始时生成 state、nonce、PKCE verifier，并存入有效期 10 分钟的一次性数据库流程。流程 Cookie 为 HttpOnly、SameSite=Lax；HTTPS 时使用 Secure 与 `__Host-` 前缀。回调按流程令牌哈希、state、有效期删除并取出记录，再交换授权码，流程不可重放。openid-client 验证令牌签名、issuer、audience、有效期与 nonce。

本地会话有效期为 8 小时，随机令牌仅在数据库保存 SHA-256 哈希；应用不持久保留 OIDC access、refresh 或 ID Token。每次取会话还要求用户 issuer 与当前配置一致；修改 issuer 会使旧身份会话失效。登录入口有数据库限流。

退出先撤销本地会话，再返回 OIDC 标准退出地址。账号中心暂不可用时仍能本地退出；没有 ID Token hint 时，身份服务可能要求确认退出。当前未接入 back-channel logout，本地会话不会因此被即时撤销。

## 请求边界与排障

写入检查 Origin 必须与 `APP_ORIGIN` 的 origin 一致，Content-Type 必须是 JSON；账本 API 另外限制请求体不超过 1 MiB。生产 OIDC 要求 HTTPS；只有同时设置 `OIDC_ALLOW_INSECURE_HTTP=true` 且应用 Origin 为 HTTP 时才允许测试 HTTP。

回调过期或重复使用：从登录入口重新开始。来源拒绝：核对浏览器地址与 `APP_ORIGIN`。会话过期：重新登录；保存未确认时先核对账本，见[保存与同步](synchronization.md)。

## 实现与验证入口

[OIDC 流程](../../src/lib/oidc.ts)、[会话与限流](../../src/lib/auth.ts)、[HTTP 校验](../../src/lib/http.ts)、[账本 API](../../src/app/api/book/route.ts)、[退出](../../src/app/api/auth/[action]/route.ts)、[隔离与认证集成测试](../../scripts/integration.mjs)。
