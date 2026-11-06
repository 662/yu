import type { LedgerFilter, TimeScope } from "./ledger-view";

export type LedgerLocation = { month: string; scope: TimeScope; filter: LedgerFilter; query: string; account: string; category: string };
const filters = new Set(["all", "expense", "income", "transfer", "pending"]);

export function readLedgerLocation(params: URLSearchParams, today: string): LedgerLocation {
  const month = params.get("month") ?? "";
  const filter = params.get("type") ?? "all";
  return {
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && !month.startsWith("0000") ? month : today.slice(0, 7),
    scope: params.get("scope") === "all" ? "all" : "month",
    filter: filters.has(filter) ? filter as LedgerFilter : "all",
    query: params.get("q") ?? "", account: params.get("account") ?? "", category: params.get("category") ?? "",
  };
}

export function ledgerHref(location: Partial<LedgerLocation>) {
  const params = new URLSearchParams();
  if (location.month) params.set("month", location.month);
  if (location.scope === "all") params.set("scope", "all");
  if (location.filter && location.filter !== "all") params.set("type", location.filter);
  if (location.query) params.set("q", location.query);
  if (location.account) params.set("account", location.account);
  if (location.category) params.set("category", location.category);
  return `/ledger${params.size ? `?${params}` : ""}`;
}
