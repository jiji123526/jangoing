"use client";

import type {
  EventRecord,
  InventoryItem,
  ShoppingListItem,
} from "@jangoing/contracts";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  getEventsData,
  getInventoryData,
  getShoppingListData,
} from "../../lib/api";

type SearchScope = "kitchen" | "history";
type SearchTag = "top" | "inventory" | "shopping" | "activity";

const searchTags: Array<{ value: SearchTag; label: string }> = [
  { value: "top", label: "Top Results" },
  { value: "inventory", label: "Inventory" },
  { value: "shopping", label: "Shopping" },
  { value: "activity", label: "Activity" },
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
  return (value ?? "").toLowerCase().replaceAll("_", " ");
}

function inventoryMetadata(item: InventoryItem): string {
  const amount = item.quantity > 0
    ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    : "0";
  return [
    item.status === "out" ? "Out of stock" : titleCase(item.status),
    amount,
    item.location ? titleCase(item.location) : null,
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

function activityMetadata(event: EventRecord): string {
  return `${titleCase(event.event_type)} · ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(event.created_at))}`;
}

function SearchArtwork({
  itemName,
  source,
}: {
  itemName: string;
  source: "inventory" | "shopping" | "activity";
}) {
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingListItem[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("kitchen");
  const [selectedTag, setSelectedTag] = useState<SearchTag>("top");
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagPill, setTagPill] = useState({ left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const tagScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getInventoryData(),
      getShoppingListData(),
      getEventsData(),
    ])
      .then(([inventoryResult, shoppingResult, eventResult]) => {
        if (!active) return;
        setInventory(inventoryResult);
        setShopping(shoppingResult);
        setEvents(eventResult);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load search data.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const stored = window.localStorage.getItem("jangoing-recent-searches");
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
        window.localStorage.removeItem("jangoing-recent-searches");
      }
    }
    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(() => {
    const needle = searchable(submittedQuery);
    if (!needle) return { inventory: [], shopping: [], activity: [] };

    const inventoryResults = scope === "history"
      ? []
      : inventory.filter((item) =>
          [
            item.item_name,
            item.status === "out"
              ? "out out of stock"
              : item.status === "low"
                ? "low low stock"
                : "in stock",
            item.location,
            item.unit,
            item.nearest_expiration_date ? "expires expiry" : "",
          ].some((value) => searchable(value).includes(needle)),
        );
    const shoppingResults = scope === "history"
      ? []
      : shopping.filter((item) =>
          [
            item.item_name,
            item.status,
            item.location,
            item.unit,
          ].some((value) => searchable(value).includes(needle)),
        );
    const activityResults = scope === "kitchen"
      ? []
      : events.filter((event) =>
          [
            event.item_name,
            event.event_type,
            event.raw_utterance,
          ].some((value) => searchable(value).includes(needle)),
        );

    return {
      inventory: inventoryResults,
      shopping: shoppingResults,
      activity: activityResults,
    };
  }, [events, inventory, scope, shopping, submittedQuery]);

  const resultCount =
    results.inventory.length + results.shopping.length + results.activity.length;
  const showTags = Boolean(submittedQuery) && !focused;
  const visibleSearchTags = searchTags.filter(
    (tag) =>
      tag.value === "top" ||
      (scope === "kitchen"
        ? tag.value === "inventory" || tag.value === "shopping"
        : tag.value === "activity"),
  );

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
        "jangoing-recent-searches",
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

  const showInventory =
    selectedTag === "top" || selectedTag === "inventory";
  const showShopping =
    selectedTag === "top" || selectedTag === "shopping";
  const showActivity =
    selectedTag === "top" || selectedTag === "activity";

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
              placeholder="Inventory, shopping, and activity"
              aria-label="Search inventory, shopping, and activity"
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
            className="search-scope-control"
            role="radiogroup"
            aria-label="Search scope"
            aria-hidden={!focused}
          >
            <button
              type="button"
              role="radio"
              aria-checked={scope === "kitchen"}
              tabIndex={focused ? 0 : -1}
              className={scope === "kitchen" ? "is-selected" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setScope("kitchen");
                setSelectedTag("top");
              }}
            >
              Kitchen
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "history"}
              tabIndex={focused ? 0 : -1}
              className={scope === "history" ? "is-selected" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setScope("history");
                setSelectedTag("top");
              }}
            >
              History
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

      {!submittedQuery ? (
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
                window.localStorage.removeItem("jangoing-recent-searches");
              }}
            >
              Clear Recent Searches
            </button>
          )}
        </section>
      ) : loading ? (
        <p className="search-empty">Loading kitchen search…</p>
      ) : resultCount === 0 ? (
        <p className="search-empty">
          No results for “{submittedQuery}” in {scope}.
        </p>
      ) : (
        <div className="search-results" aria-live="polite">
          {showInventory && results.inventory.length > 0 && (
            <section aria-labelledby="inventory-results-heading">
              <h2 id="inventory-results-heading">In Inventory</h2>
              {results.inventory.map((item) => (
                <a href="/inventory" key={item.item_name}>
                  <SearchArtwork itemName={item.item_name} source="inventory" />
                  <span>
                    <strong>{titleCase(item.item_name)}</strong>
                    <small>{inventoryMetadata(item)}</small>
                  </span>
                </a>
              ))}
            </section>
          )}

          {showShopping && results.shopping.length > 0 && (
            <section aria-labelledby="shopping-results-heading">
              <h2 id="shopping-results-heading">On Shopping List</h2>
              {results.shopping.map((item) => (
                <a href="/shopping" key={item.item_name}>
                  <SearchArtwork itemName={item.item_name} source="shopping" />
                  <span>
                    <strong>{titleCase(item.item_name)}</strong>
                    <small>{shoppingMetadata(item)}</small>
                  </span>
                </a>
              ))}
            </section>
          )}

          {showActivity && results.activity.length > 0 && (
            <section aria-labelledby="activity-results-heading">
              <h2 id="activity-results-heading">Recent Activity</h2>
              {results.activity.map((event) => (
                <article key={event.id}>
                  <SearchArtwork itemName={event.item_name} source="activity" />
                  <span>
                    <strong>{titleCase(event.item_name)}</strong>
                    <small>{activityMetadata(event)}</small>
                  </span>
                </article>
              ))}
            </section>
          )}

          {((selectedTag === "inventory" && results.inventory.length === 0) ||
            (selectedTag === "shopping" && results.shopping.length === 0) ||
            (selectedTag === "activity" && results.activity.length === 0)) && (
            <p className="search-empty">
              No {searchTags.find((tag) => tag.value === selectedTag)?.label.toLowerCase()} results.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
