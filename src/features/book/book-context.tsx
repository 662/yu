"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Account, Book, Transaction } from "./ledger";
import type { useBook } from "./store";

export type Modal = { type: "entry"; transaction?: Transaction } | { type: "account"; account?: Account; continueEntry?: boolean }
  | { type: "detail"; id: string } | { type: "reimburse"; id: string } | { type: "about" } | null;
type Workspace = {
  book: Book; today: string; saving: boolean; mutate: ReturnType<typeof useBook>["mutate"];
  setModal: Dispatch<SetStateAction<Modal>>; startEntry: () => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("BookApp is required");
  return context;
}
