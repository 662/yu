"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="error-page"><h1>账本暂时没有连上</h1><p>记录还在，请稍后再试一次。</p><Button size="lg" onClick={retry}>重新连接</Button></main>;
}
