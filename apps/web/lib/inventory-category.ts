import type { InventoryItem } from "@jangoing/contracts";

export const inventoryCategories = [
  "All",
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Pantry",
  "Frozen",
  "Leftovers",
  "Drinks",
  "Snacks",
  "Other",
] as const;

export type InventoryCategory = (typeof inventoryCategories)[number];
export type ItemCategory = Exclude<InventoryCategory, "All">;
export type StoredInventoryCategory = NonNullable<InventoryItem["category"]>;

export const storedCategoryLabels: Record<
  StoredInventoryCategory,
  ItemCategory
> = {
  leftovers: "Leftovers",
  frozen: "Frozen",
  produce: "Produce",
  dairy_eggs: "Dairy & Eggs",
  meat_seafood: "Meat & Seafood",
  pantry: "Pantry",
  drinks: "Drinks",
  snacks: "Snacks",
  other: "Other",
};

export const storedCategoryOptions = Object.entries(storedCategoryLabels) as [
  StoredInventoryCategory,
  ItemCategory,
][];

const categoryTerms: Record<Exclude<ItemCategory, "Other">, string[]> = {
  Leftovers: [
    "leftover", "left over", "meal prep", "prepared meal", "takeout",
  ],
  Frozen: ["frozen", "ice cream", "dumpling"],
  Produce: [
    "apple", "avocado", "banana", "berry", "berries", "blueberry",
    "broccoli", "carrot", "celery", "cucumber", "fruit", "grape",
    "lettuce", "lemon", "lime", "mango", "onion", "orange", "pear",
    "pepper", "potato", "salad", "spinach", "strawberry", "tomato",
  ],
  "Dairy & Eggs": [
    "butter", "cheese", "cream", "egg", "eggs", "milk", "yogurt",
  ],
  "Meat & Seafood": [
    "beef", "chicken", "fish", "meat", "pork", "salmon", "seafood",
    "shrimp", "steak", "tuna", "turkey",
  ],
  Pantry: [
    "bean", "beans", "bread", "cereal", "flour", "noodle", "oat",
    "oats", "oil", "pasta", "rice", "sauce", "soup", "spice", "sugar",
  ],
  Drinks: [
    "coffee", "drink", "juice", "soda", "sparkling water", "tea", "water",
  ],
  Snacks: [
    "bar", "candy", "chip", "chips", "chocolate", "cookie", "cracker",
    "nuts", "popcorn", "snack",
  ],
};

export function inventoryCategory(itemName: string): ItemCategory {
  const normalized = itemName.toLowerCase().replaceAll("_", " ");
  for (const [category, terms] of Object.entries(categoryTerms) as [
    Exclude<ItemCategory, "Other">,
    string[],
  ][]) {
    if (terms.some((term) => normalized.includes(term))) return category;
  }
  return "Other";
}

export function resolvedInventoryCategory(
  item: Pick<InventoryItem, "category" | "item_name">,
): ItemCategory {
  return item.category
    ? storedCategoryLabels[item.category]
    : inventoryCategory(item.item_name);
}
