"use client";

import { useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function ConfirmAction({ open, title, description, confirmLabel, cancelLabel = "取消", onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel: string; cancelLabel?: string;
  onCancel: () => void; onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <AlertDialog open={open} onOpenChange={value => { if (!value && !busy) { setError(""); onCancel(); } }}>
    <AlertDialogContent className="confirm-dialog">
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {error && <FieldError>{error}</FieldError>}
      <AlertDialogFooter>
        <Button variant="outline" autoFocus disabled={busy} onClick={() => { setError(""); onCancel(); }}>{cancelLabel}</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await onConfirm(); }
          catch (error) { setError(error instanceof Error ? error.message : "操作失败，请重试"); }
          finally { setBusy(false); }
        }}>{busy ? "正在处理…" : confirmLabel}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
