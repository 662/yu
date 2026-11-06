"use client";

import { ImportPage } from "../import/import-page";
import { useWorkspace } from "./book-context";

export function BookImportPage() {
  const { book, saving, mutate, setModal } = useWorkspace();
  return <ImportPage book={book} saving={saving} onCommand={mutate} onAddAccount={() => setModal({ type: "account" })} />;
}
