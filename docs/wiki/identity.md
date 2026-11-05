---
id: identity
title: 身份与权限
summary: 说明 Keycloak 配置、登录流程、会话和账本隔离边界。
---

# 身份与权限

## 身份与账本归属

用户以 OIDC `issuer + sub` 唯一识别，姓名和邮箱只作展示，邮箱相同不会合并账号。首次登录在事务中创建用户账本和默认分类；数据库对用户与账本建立一对一唯一约束。

所有账本读取、写入和版本锁均从服务端会话解析用户，再按其账本执行。客户端 `ownerId` 只是绑定当前页面账号的额外校验，不能指定要访问谁的账本。跨标签页切换账号时的清理行为见[保存与同步](synchronization.md)。

## Keycloak 配置

脱敏模板见 [.env.nas.example](../../.env.nas.example) 与 [.env.example](../../.env.example)。以下均为占位示例：账号中心 `https://id.example.com`，realm `example`，client ID `yu`；部署时替换为自己的域名、realm 和客户端 ID。

客户端使用 OpenID Connect，开启 Client authentication 和 Standard flow，使用客户端密钥。应用固定发送 S256 PKCE，无需开启 Implicit flow 或 Direct access grants。

| Keycloak 设置 | 示例值（部署时替换） |
| --- | --- |
| Valid redirect URIs | `https://book.example.com/api/auth/callback/keycloak` |
| Valid post logout redirect URIs | `https://book.example.com/login` |
| Web origins | `https://book.example.com` |

`KEYCLOAK_ISSUER` 必须与 discovery 返回的 issuer 一致，浏览器与应用容器都需可达。`APP_ORIGIN` 用来构造回调、退出地址并校验写入来源。开发使用单独客户端和精确的本地回调，不扩大正式客户端回调范围。第三方登录、密码和账号管理由 Keycloak 提供；旧 `/setup`、`/password` 页面不提供本地账号体系。

## 登录与会话

登录开始时生成 state、nonce、PKCE verifier，并存入有效期 10 分钟的一次性数据库流程。流程 Cookie 为 HttpOnly、SameSite=Lax；HTTPS 时使用 Secure 与 `__Host-` 前缀。回调按流程令牌哈希、state、有效期删除并取出记录，再交换授权码，流程不可重放。openid-client 验证令牌签名、issuer、audience、有效期与 nonce。

本地会话有效期为 8 小时，随机令牌仅在数据库保存 SHA-256 哈希；应用不持久保留 Keycloak access、refresh 或 ID Token。每次取会话还要求用户 issuer 与当前配置一致；修改 issuer 会使旧身份会话失效。登录入口有数据库限流。

退出先撤销本地会话，再返回 Keycloak 标准退出地址。账号中心暂不可用时仍能本地退出；没有 ID Token hint 时，Keycloak 可能要求确认退出。当前未接入 back-channel logout，本地会话不会因此被即时撤销。

## 请求边界与排障

写入检查 Origin 必须与 `APP_ORIGIN` 的 origin 一致，Content-Type 必须是 JSON；账本 API 另外限制请求体不超过 1 MiB。生产 OIDC 要求 HTTPS；只有同时设置 `OIDC_ALLOW_INSECURE_HTTP=true` 且应用 Origin 为 HTTP 时才允许测试 HTTP。

回调过期或重复使用：从登录入口重新开始。来源拒绝：核对浏览器地址与 `APP_ORIGIN`。会话过期：重新登录；保存未确认时先核对账本，见[保存与同步](synchronization.md)。

## 实现与验证入口

[OIDC 流程](../../src/lib/oidc.ts)、[会话与限流](../../src/lib/auth.ts)、[HTTP 校验](../../src/lib/http.ts)、[账本 API](../../src/app/api/book/route.ts)、[退出](../../src/app/api/auth/[action]/route.ts)、[隔离与认证集成测试](../../scripts/integration.mjs)。
