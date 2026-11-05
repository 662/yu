"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Fish, ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const messages: Record<string, string> = {
  unavailable: "账号中心暂时没有连上，请稍后再试。",
  failed: "这次登录未完成或已过期，请重新登录。",
  canceled: "已取消登录，你可以随时回来。",
};

export function AuthScreen({ configured, error }: { configured: boolean; error?: string }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return <main className="auth-page"><section className="auth-story"><Link href="/" className="auth-brand"><Fish />年年有鱼</Link><div><p className="eyebrow">A LITTLE MORE PEACE OF MIND</p><h1>日子，一笔一笔。<br />生活，慢慢有余。</h1><p>看清每一份花销，<br />也看见一点一滴积累起来的生活。</p><span className="auth-leaf"><Leaf /></span></div><p className="auth-story-footer">一份只属于自己的生活记录</p><Fish className="auth-background-fish" aria-hidden="true" /></section><section className="auth-panel"><div className="auth-form-wrap"><span className="auth-lock"><ShieldCheck /></span><h2>欢迎回到小账本</h2><p className="auth-description">用你的账号登录，把今天的生活接着记。<br />每个人都有一份独立的账本。</p>
    {error && messages[error] && <p className="auth-message" role="alert">{messages[error]}</p>}
    <Button className="w-full" size="lg" disabled={!configured || pending} onClick={() => { setPending(true); window.location.assign(new URL("/api/auth/signin/oidc", window.location.origin).href); }}><ShieldCheck data-icon="inline-start" />{pending ? "正在前往账号中心…" : "通过账号中心登录"}<ArrowRight data-icon="inline-end" /></Button>
    {!configured && <p className="auth-message" role="status">账号中心暂未连接，请稍后再试。</p>}
    <p className="auth-sso-note">已有登录状态时，可直接进入。<br />账号、密码与第三方登录方式由账号中心统一管理。</p>
    <p className="auth-footnote">手机与电脑登录同一账号，记录随时接着记。</p></div></section></main>;
}
