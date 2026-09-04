"use client";

import type {
  InventoryItem,
  ShoppingListItem,
} from "@jangoing/contracts";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { resolvedInventoryCategory } from "../../lib/inventory-category";
import { inventoryHref } from "../../lib/inventory-navigation";
import { protectedItemMediaUrl } from "../../lib/item-media-url";
import {
  legacySearchHistoryStorageKey,
  searchHistoryStorageKey,
} from "../../lib/search-history";
import { useCurrentHousehold } from "../HouseholdContext";
import { useKitchenData } from "../KitchenDataContext";
import { LoadingSkeleton } from "../LoadingSkeleton";
import { RouteTransitionLink } from "../RouteTransitionLink";

type SearchScope = "inventory" | "shopping";
type SearchTag =
  | "top"
  | "in_stock"
  | "low"
  | "out"
  | "expiring"
  | "to_buy"
  | "purchased";

const inventorySearchTags: Array<{ value: SearchTag; label: string }> = [
  { value: "top", label: "Top Results" },
  { value: "in_stock", label: "In Stock" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out" },
  { value: "expiring", label: "Expiring" },
];

const shoppingSearchTags: Array<{ value: SearchTag; label: string }> = [
  { value: "top", label: "Top Results" },
  { value: "to_buy", label: "To Buy" },
  { value: "purchased", label: "Purchased" },
];

const suggestedSearches = [
  "milk",
  "fridge",
  "out of stock",
  "expires",
];

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function searchable(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesSearch(
  values: Array<string | null | undefined>,
  rawQuery: string,
): boolean {
  const document = searchable(values.filter(Boolean).join(" "));
  const terms = searchable(rawQuery).split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => document.includes(term));
}

function inventorySearchValues(item: InventoryItem): string[] {
  const stockStatus =
    item.status === "out"
      ? "out out of stock empty unavailable"
      : item.status === "low"
        ? "low low stock running low almost out"
        : "in stock available stocked";
  const expiryStatus =
    item.expiry_state === "expired"
      ? "expired past date expiry expires"
      : item.expiry_state === "expiring_soon"
        ? "expiring expiring soon use soon expiry expires"
        : item.nearest_expiration_date
          ? "fresh dated expiry expires"
          : "";

  return [
    item.item_name,
    resolvedInventoryCategory(item),
    stockStatus,
    expiryStatus,
    item.location ?? "",
    item.unit ?? "",
    item.nearest_expiration_date ?? "",
    item.added_at ?? "",
  ];
}

function inventoryAddedDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function shoppingSearchValues(item: ShoppingListItem): string[] {
  return [
    item.item_name,
    item.status === "active"
      ? "active to buy shopping needed need to buy"
      : "purchased bought done completed",
    item.location ?? "",
    item.unit ?? "",
  ];
}

function inventoryMetadata(item: InventoryItem): string {
  const amount = item.quantity > 0
    ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    : "0";
  return [
    item.status === "out" ? "Out of stock" : titleCase(item.status),
    amount,
    item.location ? titleCase(item.location) : null,
    item.added_at ? `Added ${inventoryAddedDateLabel(item.added_at)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function shoppingMetadata(item: ShoppingListItem): string {
  return item.status === "purchased"
    ? `Purchased ${new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(new Date(item.purchased_at ?? item.added_at))}`
    : `To buy · ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
}

function SearchArtwork({
  itemName,
  thumbnailUrl,
  source,
}: {
  itemName: string;
  thumbnailUrl?: string | null;
  source: "inventory" | "shopping";
}) {
  const protectedThumbnail = protectedItemMediaUrl(thumbnailUrl);
  if (protectedThumbnail) {
    return (
      <span
        className={`search-result-artwork source-${source} has-photo`}
        aria-hidden="true"
      >
        <img className="item-artwork-image" src={protectedThumbnail} alt="" />
        <span className="search-result-artwork-overlay">
          {titleCase(itemName)}
        </span>
      </span>
    );
  }

  const initials = titleCase(itemName)
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");

  return (
    <span className={`search-result-artwork source-${source}`} aria-hidden="true">
      {initials || "JG"}
    </span>
  );
}

export default function SearchPage() {
  const { user } = useCurrentHousehold();
  const {
    dashboard: { inventory, shoppingList: shopping },
    loading,
    loadError: error,
  } = useKitchenData();
  const recentSearchStorageKey = searchHistoryStorageKey(user.id);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("inventory");
  const [selectedTag, setSelectedTag] = useState<SearchTag>("top");
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [tagPill, setTagPill] = useState({ left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const tagScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentSearches([]);
    window.localStorage.removeItem(legacySearchHistoryStorageKey);
    const stored = window.localStorage.getItem(recentSearchStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(
            parsed
              .filter((entry): entry is string => typeof entry === "string")
              .slice(0, 5),
          );
        }
      } catch {
        window.localStorage.removeItem(recentSearchStorageKey);
      }
    }
  }, [recentSearchStorageKey]);

  const results = useMemo(() => {
    const needle = searchable(submittedQuery);
    if (!needle) return { inventory: [], shopping: [] };

    const inventoryResults = scope !== "inventory"
      ? []
      : inventory.filter((item) =>
          matchesSearch(inventorySearchValues(item), needle)
        );
    const shoppingResults = scope !== "shopping"
      ? []
      : shopping.filter((item) =>
          matchesSearch(shoppingSearchValues(item), needle)
        );
    return {
      inventory: inventoryResults,
      shopping: shoppingResults,
    };
  }, [inventory, scope, shopping, submittedQuery]);

  const filteredInventory = useMemo(
    () =>
      results.inventory.filter((item) => {
        if (selectedTag === "top") return true;
        if (selectedTag === "in_stock") return item.status === "in_stock";
        if (selectedTag === "low") return item.status === "low";
        if (selectedTag === "out") return item.status === "out";
        if (selectedTag === "expiring") {
          return (
            item.expiry_state === "expiring_soon" ||
            item.expiry_state === "expired"
          );
        }
        return false;
      }),
    [results.inventory, selectedTag],
  );
  const filteredShopping = useMemo(
    () =>
      results.shopping.filter((item) => {
        if (selectedTag === "top") return true;
        if (selectedTag === "to_buy") return item.status === "active";
        if (selectedTag === "purchased") return item.status === "purchased";
        return false;
      }),
    [results.shopping, selectedTag],
  );
  const resultCount = filteredInventory.length + filteredShopping.length;
  const showTags = Boolean(submittedQuery) && !focused;
  const visibleSearchTags =
    scope === "inventory" ? inventorySearchTags : shoppingSearchTags;

  useEffect(() => {
    if (!showTags) return;
    function updatePill() {
      const selectedButton =
        tagScrollRef.current?.querySelector<HTMLElement>(
          `[data-search-tag="${selectedTag}"]`,
        );
      if (!selectedButton) return;
      setTagPill({
        left: selectedButton.offsetLeft,
        width: selectedButton.offsetWidth,
      });
    }
    const frame = window.requestAnimationFrame(updatePill);
    window.addEventListener("resize", updatePill);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePill);
    };
  }, [scope, selectedTag, showTags]);

  function submitSearch(rawQuery: string) {
    const nextQuery = rawQuery.trim();
    if (!nextQuery) return;
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
    setSelectedTag("top");
    setFocused(false);
    inputRef.current?.blur();
    setRecentSearches((current) => {
      const next = [
        nextQuery,
        ...current.filter(
          (entry) => entry.toLowerCase() !== nextQuery.toLowerCase(),
        ),
      ].slice(0, 5);
      window.localStorage.setItem(
        recentSearchStorageKey,
        JSON.stringify(next),
      );
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitSearch(query);
  }

  function clearSearch() {
    setQuery("");
    setSubmittedQuery("");
    setSelectedTag("top");
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <main id="search" className="search-page">
      <header className="search-titlebar">
        <h1>Search</h1>
      </header>

      <div className="search-sticky-controls">
        <form className="search-bar-form" role="search" onSubmit={handleSubmit}>
          <div className="search-bar-field">
            <Search size={17} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Inventory and shopping list"
              aria-label="Search inventory and shopping list"
              autoComplete="off"
              enterKeyHint="search"
              onFocus={() => setFocused(true)}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search text"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X size={12} strokeWidth={3} />
              </button>
            )}
          </div>
          {(focused || query) && (
            <button
              className="search-cancel"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSearch}
            >
              Cancel
            </button>
          )}
        </form>

        <div
          className={`search-secondary-control${
            focused ? " is-focused" : ""
          }${showTags ? " shows-tags" : ""}`}
        >
          <div
            className={`search-scope-control scope-${scope}`}
            role="radiogroup"
            aria-label="Search scope"
            aria-hidden={!focused}
          >
            <span className="search-scope-pill" aria-hidden="true" />
            <button
              type="button"
              role="radio"
              aria-checked={scope === "inventory"}
              tabIndex={focused ? 0 : -1}
              className={scope === "inventory" ? "is-selected" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setScope("inventory");
                setSelectedTag("top");
              }}
            >
              Inventory
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "shopping"}
              tabIndex={focused ? 0 : -1}
              className={scope === "shopping" ? "is-selected" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setScope("shopping");
                setSelectedTag("top");
              }}
            >
              Shopping List
            </button>
          </div>

          <div
            className="search-tag-scroll"
            ref={tagScrollRef}
            role="tablist"
            aria-label="Filter search results"
            aria-hidden={!showTags}
          >
            <span
              className="search-tag-pill"
              aria-hidden="true"
              style={{
                width: `${tagPill.width}px`,
                transform: `translateX(${tagPill.left}px)`,
              }}
            />
            {visibleSearchTags.map((tag) => (
              <button
                type="button"
                role="tab"
                key={tag.value}
                data-search-tag={tag.value}
                aria-selected={selectedTag === tag.value}
                className={selectedTag === tag.value ? "is-selected" : undefined}
                tabIndex={showTags ? 0 : -1}
                onClick={() => setSelectedTag(tag.value)}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="message error search-message">{error}</p>}

      {loading ? (
        <LoadingSkeleton
          variant="search"
          rows={5}
          label="Loading kitchen search"
        />
      ) : !submittedQuery ? (
        <section className="search-start-section">
          <h2>{recentSearches.length ? "Recent Searches" : "Try Searching"}</h2>
          <div className="search-suggestion-list">
            {(recentSearches.length ? recentSearches : suggestedSearches).map(
              (suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => submitSearch(suggestion)}
                >
                  <Search size={17} aria-hidden="true" />
                  <span>{suggestion}</span>
                </button>
              ),
            )}
          </div>
          {recentSearches.length > 0 && (
            <button
              className="search-clear-recents"
              type="button"
              onClick={() => {
                setRecentSearches([]);
                window.localStorage.removeItem(recentSearchStorageKey);
              }}
            >
              Clear Recent Searches
            </button>
          )}
        </section>
      ) : resultCount === 0 ? (
        <p className="search-empty">
          No results for “{submittedQuery}” in {scope}.
        </p>
      ) : (
        <div className="search-results" aria-live="polite">
          {scope === "inventory" && filteredInventory.length > 0 && (
            <section aria-labelledby="inventory-results-heading">
              <h2 id="inventory-results-heading">In Inventory</h2>
              {filteredInventory.map((item) => (
                <RouteTransitionLink
                  href={inventoryHref({ item: item.item_name })}
                  key={item.item_name}
                >
                  <SearchArtwork
                    itemName={item.item_name}
                    thumbnailUrl={item.thumbnail_url}
                    source="inventory"
                  />
                  <span>
                    <strong>{titleCase(item.item_name)}</strong>
                    <small>{inventoryMetadata(item)}</small>
                  </span>
                </RouteTransitionLink>
              ))}
            </section>
          )}

          {scope === "shopping" && filteredShopping.length > 0 && (
            <section aria-labelledby="shopping-results-heading">
              <h2 id="shopping-results-heading">On Shopping List</h2>
              {filteredShopping.map((item) => (
                <a href="/shopping" key={item.item_name}>
                  <SearchArtwork
                    itemName={item.item_name}
                    thumbnailUrl={item.thumbnail_url}
                    source="shopping"
                  />
                  <span>
                    <strong>{titleCase(item.item_name)}</strong>
                    <small>{shoppingMetadata(item)}</small>
                  </span>
                </a>
              ))}
            </section>
          )}

        </div>
      )}
    </main>
  );
}
