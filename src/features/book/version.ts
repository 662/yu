import type { Book } from "./ledger";

// Include the owner: two accounts can have the same revision.
export function bookEtag(book: Pick<Book, "ownerId" | "revision">): string | undefined {
  return book.ownerId && book.revision !== undefined ? `"${book.ownerId}:${book.revision}"` : undefined;
}
