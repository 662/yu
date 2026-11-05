"use client";

import { useState } from "react";
import { parseMoney } from "./ledger";

export class FieldValidationError extends Error {
  constructor(public field: string, message: string) { super(message); }
}

export function readAmount(value: string, field: string, allowZero = false) {
  let amount: number;
  try { amount = parseMoney(value); }
  catch (error) { throw new FieldValidationError(field, (error as Error).message); }
  if (!allowZero && amount === 0) throw new FieldValidationError(field, "金额需大于 0");
  return amount;
}

export function checkDate(value: string, field: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new FieldValidationError(field, "请选择有效日期");
}

export function useFormFeedback() {
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  function clear(field?: string) {
    setError("");
    if (field) setFields(previous => { const next = { ...previous }; delete next[field]; return next; });
    else setFields({});
  }
  function reject(error: unknown) {
    if (error instanceof FieldValidationError) {
      setFields({ [error.field]: error.message });
      requestAnimationFrame(() => document.getElementById(error.field)?.focus());
    } else setError(error instanceof Error ? error.message : "保存失败，请重试");
  }
  return { error, fields, clear, reject };
}
