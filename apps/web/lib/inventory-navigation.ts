export const inventoryScopes = [
  "all",
  "low",
  "out",
  "expiring",
  "restock",
] as const;

export type InventoryScope = (typeof inventoryScopes)[number];

export interface InventoryNavigationIntent {
  scope: InventoryScope;
  item: string | null;
}

export function parseInventoryNavigation(
  searchParams: Pick<URLSearchParams, "get">,
): InventoryNavigationIntent {
  const requestedScope = searchParams.get("scope");
  const scope = inventoryScopes.includes(requestedScope as InventoryScope)
    ? requestedScope as InventoryScope
    : "all";
  const item = searchParams.get("item")?.trim().slice(0, 120) || null;

  return {
    scope,
    item,
  };
}

export function inventoryHref(
  intent: Partial<InventoryNavigationIntent> = {},
): string {
  const searchParams = new URLSearchParams();
  if (intent.scope && intent.scope !== "all") {
    searchParams.set("scope", intent.scope);
  }
  if (intent.item) searchParams.set("item", intent.item);
  const query = searchParams.toString();
  return query ? `/inventory?${query}` : "/inventory";
}
