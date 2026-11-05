export const categoryIconNames = ["Utensils", "ShoppingBag", "TrainFront", "House", "Coffee", "HeartPulse", "Package", "Ellipsis", "Briefcase", "Gift", "TrendingUp", "GraduationCap", "PawPrint", "Plane"] as const;
export const categoryTones = ["orange", "pink", "blue", "green", "purple", "olive", "neutral"] as const;
export type CategoryKind = "expense" | "income";
export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: typeof categoryIconNames[number];
  tone: typeof categoryTones[number];
  archived: boolean;
  order: number;
  preset: boolean;
};

export function defaultCategories(): Category[] {
  return [
    { id: "food", name: "餐饮", icon: "Utensils", tone: "orange" },
    { id: "shopping", name: "购物", icon: "ShoppingBag", tone: "pink" },
    { id: "transport", name: "交通", icon: "TrainFront", tone: "blue" },
    { id: "home", name: "居住", icon: "House", tone: "green" },
    { id: "fun", name: "休闲", icon: "Coffee", tone: "purple" },
    { id: "health", name: "健康", icon: "HeartPulse", tone: "pink" },
    { id: "daily", name: "日用", icon: "Package", tone: "olive" },
    { id: "other", name: "其他", icon: "Ellipsis", tone: "neutral" },
  ].map((c, order) => ({ ...c, kind: "expense", archived: false, preset: true, order } as Category)).concat([
    { id: "工资", name: "工资", kind: "income", icon: "Briefcase", tone: "green", archived: false, preset: true, order: 0 },
    { id: "奖金", name: "奖金", kind: "income", icon: "Gift", tone: "olive", archived: false, preset: true, order: 1 },
    { id: "其他收入", name: "其他收入", kind: "income", icon: "TrendingUp", tone: "blue", archived: false, preset: true, order: 2 },
  ]);
}

export function bookCategories(book: { categories?: Category[] }): Category[] {
  return [...(book.categories ?? defaultCategories())].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function categoryName(book: { categories?: Category[] }, kind: CategoryKind, id: string) {
  return bookCategories(book).find((c) => c.kind === kind && c.id === id)?.name ?? id;
}

export function activeCategories(book: { categories?: Category[] }, kind: CategoryKind) {
  return bookCategories(book).filter((c) => c.kind === kind && !c.archived);
}
