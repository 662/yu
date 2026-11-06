"use client";

import { useSearchParams } from "next/navigation";
import { CategoryManager } from "./category-manager";
import { useWorkspace } from "./book-context";

export function BookCategoriesPage() {
  const { book, saving, mutate } = useWorkspace();
  const params = useSearchParams();
  const kind = params.get("kind") === "income" ? "income" : "expense";
  return <CategoryManager key={kind} book={book} kind={kind} onKindChange={next => {
    window.history.pushState(null, "", `/categories?kind=${next}`);
  }} saving={saving} onCommand={mutate} />;
}
