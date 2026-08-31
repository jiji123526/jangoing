"use client";

import type {
  CreateEventRequest,
  EventRecord,
  EventType,
  Intent,
  InventoryItem,
  LoggedInterpretation,
  ShoppingListItem,
} from "@jangoing/contracts";
import {
  CalendarDays,
  Check,
  ChevronUp,
  CircleUserRound,
  LoaderCircle,
  Mic,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  addShoppingItem,
  createEvent,
  deleteShoppingItem,
  getDashboardData,
  getInventoryData,
  getShoppingListData,
  interpretCommand,
  markShoppingItemPurchased,
  removeInventoryItem,
  restoreShoppingItem,
  updateInventoryItem,
  updateInferenceOutcome,
  type DashboardData,
} from "../lib/api";

const eventTypeByIntent: Partial<Record<Intent, EventType>> = {
  add_item: "item_added",
  set_low_threshold: "item_low_threshold_set",
  consume_item: "item_consumed",
  mark_low: "item_marked_low",
  mark_out: "item_marked_out",
  throw_away: "item_thrown_away",
  add_to_buy: "item_added_to_buy",
};

const examples = [
  "Add two cartons of milk",
  "We are low on eggs",
  "We have no milk",
  "Put yogurt on the shopping list",
];

const editableIntents: Intent[] = [
  "add_item",
  "set_low_threshold",
  "consume_item",
  "mark_low",
  "mark_out",
  "throw_away",
  "add_to_buy",
  "needs_clarification",
];

type EditableInterpretation = {
  intent: Intent;
  itemName: string;
  quantity: string;
  lowThreshold: string;
  unit: string;
  location: "" | "fridge" | "freezer" | "pantry";
  expirationDate: string;
};

function toEditable(interpretation: LoggedInterpretation): EditableInterpretation {
  return {
    intent: interpretation.intent,
    itemName: interpretation.slots.item_name ?? "",
    quantity: interpretation.slots.quantity?.toString() ?? "",
    lowThreshold: interpretation.slots.low_threshold?.toString() ?? "",
    unit: interpretation.slots.unit ?? "",
    location: interpretation.slots.location ?? "",
    expirationDate: interpretation.slots.expiration_date ?? "",
  };
}

const emptyDashboard: DashboardData = {
  inventory: [],
  events: [],
  shoppingList: [],
};

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function canonicalItemName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function relativeTimestamp(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

const inventoryCategories = [
  "All",
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Pantry",
  "Frozen",
  "Drinks",
  "Snacks",
  "Other",
] as const;

const inventoryUnitOptions = [
  "piece",
  "bottle",
  "carton",
  "bag",
  "box",
  "can",
  "jar",
  "pack",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "cup",
] as const;

type InventoryCategory = (typeof inventoryCategories)[number];
type ItemCategory = Exclude<InventoryCategory, "All">;

const categoryTerms: Record<Exclude<ItemCategory, "Other">, string[]> = {
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

function inventoryCategory(itemName: string): ItemCategory {
  const normalized = itemName.toLowerCase().replaceAll("_", " ");
  for (const [category, terms] of Object.entries(categoryTerms) as [
    Exclude<ItemCategory, "Other">,
    string[],
  ][]) {
    if (terms.some((term) => normalized.includes(term))) return category;
  }
  return "Other";
}

function quantityLabel(item: InventoryItem): string {
  if (item.quantity <= 0) {
    return item.status === "out"
      ? `0${item.unit ? ` ${item.unit}` : ""}`
      : "Quantity not recorded";
  }
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
}

function expiryLabel(item: InventoryItem): string | null {
  if (!item.nearest_expiration_date) return null;
  const expiry = new Date(`${item.nearest_expiration_date}T00:00:00`);
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((expiry.getTime() - localToday.getTime()) / 86_400_000);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function editorDateLabel(value: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function shoppingPurchaseDateLabel(value: string): string {
  return `Purchased ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))}`;
}

function shoppingInventoryStatusLabel(item: InventoryItem | undefined): string {
  if (!item) return "Not tracked in inventory";
  if (item.status === "out" || item.quantity <= 0) return "Out of stock";

  const amount = quantityLabel(item);
  if (item.status === "low") return `Low · ${amount} left`;
  return `In stock · ${amount}`;
}

function shoppingPurchaseContextLabel(item: ShoppingListItem): string {
  const unit = item.unit
    ? `${item.unit}${
        item.quantity > 1 &&
        item.unit !== "dozen" &&
        !item.unit.endsWith("s")
          ? "s"
          : ""
      }`
    : "";
  const parts = [
    `Buy ${item.quantity}${unit ? ` ${unit}` : ""}`,
    item.location ? titleCase(item.location) : null,
    item.expiration_date
      ? `Expires ${editorDateLabel(item.expiration_date)}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

const shoppingSwipeActionWidth = 84;

function ShoppingArtwork({ itemName }: { itemName: string }) {
  const category = inventoryCategory(itemName);
  const shortLabel = category === "Dairy & Eggs"
    ? "D&E"
    : category === "Meat & Seafood"
      ? "M&S"
      : category.slice(0, 3).toUpperCase();
  const categoryClass = category
    .toLowerCase()
    .replaceAll(" & ", "-")
    .replaceAll(" ", "-");

  return (
    <div
      className={`shopping-artwork category-${categoryClass}`}
      aria-hidden="true"
    >
      <span>{shortLabel}</span>
    </div>
  );
}

function ShoppingSwipeRow({
  itemName,
  secondaryText,
  actionLabel,
  purchased = false,
  busy,
  open,
  onOpenChange,
  onAction,
  onDelete,
}: {
  itemName: string;
  secondaryText: string;
  actionLabel: "Done" | "Undo";
  purchased?: boolean;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: () => void;
  onDelete?: () => void;
}) {
  const swipeWidth = shoppingSwipeActionWidth * (onDelete ? 2 : 1);
  const pointerStart = useRef(0);
  const pointerBase = useRef(0);
  const pointerMoved = useRef(false);
  const pointerOffset = useRef(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const offset = dragOffset ?? (open ? -swipeWidth : 0);

  function finishSwipe() {
    const shouldOpen = pointerOffset.current <= -(swipeWidth / 2);
    setDragOffset(null);
    onOpenChange(shouldOpen);
  }

  return (
    <li className={`shopping-swipe-row${purchased ? " is-purchased" : ""}`}>
      <div
        className="shopping-swipe-actions"
        style={{ width: `${swipeWidth}px` }}
      >
        <button
          className={`shopping-swipe-action${
            actionLabel === "Undo" ? " is-undo" : ""
          }`}
          type="button"
          disabled={busy}
          onFocus={() => onOpenChange(true)}
          onClick={onAction}
        >
          {busy ? "Saving…" : actionLabel}
        </button>
        {onDelete && (
          <button
            className="shopping-swipe-action is-delete"
            type="button"
            disabled={busy}
            onFocus={() => onOpenChange(true)}
            onClick={onDelete}
          >
            Delete
          </button>
        )}
      </div>
      <div
        className="shopping-swipe-content"
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onClick={() => {
          if (open && !pointerMoved.current) onOpenChange(false);
        }}
        onPointerDown={(event) => {
          if (busy || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerStart.current = event.clientX;
          pointerBase.current = open ? -swipeWidth : 0;
          pointerOffset.current = pointerBase.current;
          pointerMoved.current = false;
          setDragOffset(pointerBase.current);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const delta = event.clientX - pointerStart.current;
          if (Math.abs(delta) > 4) pointerMoved.current = true;
          pointerOffset.current = Math.max(
            -swipeWidth,
            Math.min(0, pointerBase.current + delta),
          );
          setDragOffset(pointerOffset.current);
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          finishSwipe();
        }}
        onPointerCancel={finishSwipe}
      >
        <ShoppingArtwork itemName={itemName} />
        <div className="shopping-row-copy">
          <strong>{titleCase(itemName)}</strong>
          <small>{secondaryText}</small>
        </div>
      </div>
    </li>
  );
}

function attentionLabel(item: InventoryItem): string | null {
  if (item.expiry_state === "expired" || item.expiry_state === "expiring_soon") {
    return expiryLabel(item);
  }
  if (item.status === "out") return "Out of stock";
  if (item.status === "low") return "Low stock";
  return null;
}

function InventoryArtwork({ category }: { category: ItemCategory }) {
  const shortLabel = category === "Dairy & Eggs"
    ? "D&E"
    : category === "Meat & Seafood"
      ? "M&S"
      : category.slice(0, 3).toUpperCase();
  return (
    <div className="inventory-artwork" aria-hidden="true">
      <span>{shortLabel}</span>
    </div>
  );
}

function HomeArtwork({ itemName }: { itemName: string }) {
  const category = inventoryCategory(itemName);
  const categoryClass = category
    .toLowerCase()
    .replaceAll(" & ", "-")
    .replaceAll(" ", "-");
  const initials = titleCase(itemName)
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");

  return (
    <div
      className={`home-update-artwork category-${categoryClass}`}
      aria-hidden="true"
    >
      <span>{initials || "JG"}</span>
      <small>{category}</small>
    </div>
  );
}

function recentUpdateLabel(
  event: EventRecord,
  inventoryItem: InventoryItem | undefined,
): string {
  const amount = event.quantity
    ? `${event.quantity}${event.unit ? ` ${event.unit}` : ""}`
    : null;

  switch (event.event_type) {
    case "item_added":
      return `Added${amount ? ` ${amount}` : ""} · ${relativeTimestamp(event.created_at)}`;
    case "item_consumed":
      return `Used${amount ? ` ${amount}` : ""} · ${relativeTimestamp(event.created_at)}`;
    case "item_marked_low":
      return `Marked low · ${relativeTimestamp(event.created_at)}`;
    case "item_marked_out":
      return `Out of stock · ${relativeTimestamp(event.created_at)}`;
    case "item_thrown_away":
      return `Thrown away · ${relativeTimestamp(event.created_at)}`;
    case "item_added_to_buy":
      return `Added to shopping · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_purchased":
      return `Purchased · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_restored":
      return `Returned to list · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_deleted":
      return `Removed from list · ${relativeTimestamp(event.created_at)}`;
    case "item_low_threshold_set":
      return `Low level updated · ${relativeTimestamp(event.created_at)}`;
    case "item_adjusted":
      return inventoryItem
        ? `${quantityLabel(inventoryItem)} · ${relativeTimestamp(event.created_at)}`
        : `Inventory updated · ${relativeTimestamp(event.created_at)}`;
    case "item_removed":
      return `Removed from inventory · ${relativeTimestamp(event.created_at)}`;
  }
}

function InventoryItemRow({
  item,
  editing = false,
  busy = false,
  onOpen,
  onCancel,
  onSave,
  onRemove,
}: {
  item: InventoryItem;
  editing?: boolean;
  busy?: boolean;
  onOpen?: () => void;
  onCancel?: () => void;
  onSave?: (update: {
    quantity: number;
    unit: string | null;
    location: InventoryItem["location"];
    expiration_date: string | null;
    low_threshold: number | null;
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const category = inventoryCategory(item.item_name);
  const attention = attentionLabel(item);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [location, setLocation] = useState(item.location ?? "");
  const [expirationDate, setExpirationDate] = useState(
    item.nearest_expiration_date ?? "",
  );
  const [lowThreshold, setLowThreshold] = useState(
    item.low_threshold?.toString() ?? "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const metadata = [
    quantityLabel(item),
    item.location ? titleCase(item.location) : null,
    attention ? null : expiryLabel(item),
  ].filter((value): value is string => Boolean(value));

  useEffect(() => {
    if (!editing) return;
    setQuantity(String(item.quantity));
    setUnit(item.unit ?? "");
    setLocation(item.location ?? "");
    setExpirationDate(item.nearest_expiration_date ?? "");
    setLowThreshold(item.low_threshold?.toString() ?? "");
    setValidationError(null);
  }, [
    editing,
    item.location,
    item.low_threshold,
    item.nearest_expiration_date,
    item.quantity,
    item.unit,
  ]);

  if (editing) {
    const hasCustomUnit =
      unit && !(inventoryUnitOptions as readonly string[]).includes(unit);

    function adjustQuantity(delta: number) {
      const current = Number(quantity);
      const baseline = Number.isFinite(current) ? current : 1;
      const next = Math.max(0, baseline + delta);
      setQuantity(String(Number(next.toFixed(2))));
      setValidationError(null);
    }

    return (
      <article className="inventory-item-row is-editing">
        <InventoryArtwork category={category} />
        <form
          className="inventory-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            const parsedQuantity = Number(quantity);
            const parsedLowThreshold = lowThreshold
              ? Number(lowThreshold)
              : null;
            if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
              setValidationError("Quantity cannot be negative.");
              return;
            }
            if (
              parsedLowThreshold !== null &&
              (!Number.isFinite(parsedLowThreshold) || parsedLowThreshold <= 0)
            ) {
              setValidationError("Low threshold must be greater than zero.");
              return;
            }
            setValidationError(null);
            void onSave?.({
              quantity: parsedQuantity,
              unit: unit.trim() || null,
              location: location as InventoryItem["location"],
              expiration_date: expirationDate || null,
              low_threshold: parsedLowThreshold,
            });
          }}
        >
          <div className="inventory-edit-header">
            <strong>{titleCase(item.item_name)}</strong>
            <button
              className="inventory-edit-remove"
              type="button"
              aria-label={`Remove ${titleCase(item.item_name)} from inventory`}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove ${titleCase(item.item_name)} from inventory?`)) {
                  void onRemove?.();
                }
              }}
            >
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="inventory-edit-fields">
            <div className="inventory-edit-field-row">
              <span>Quantity</span>
              <div className="inventory-quantity-stepper">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => adjustQuantity(-1)}
                  disabled={busy}
                >
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  aria-label="Quantity"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setValidationError(null);
                  }}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => adjustQuantity(1)}
                  disabled={busy}
                >
                  +
                </button>
              </div>
            </div>

            <label className="inventory-edit-field-row">
              <span>Low at</span>
              <input
                className="inventory-edit-number-control"
                type="number"
                min="0.01"
                step="any"
                inputMode="decimal"
                aria-label="Low quantity threshold"
                placeholder="Not set"
                value={lowThreshold}
                onChange={(event) => {
                  setLowThreshold(event.target.value);
                  setValidationError(null);
                }}
              />
            </label>

            <label className="inventory-edit-field-row">
              <span>Unit</span>
              <span className="inventory-edit-row-value" aria-hidden="true">
                {unit ? titleCase(unit) : "Not specified"}
                <span className="inventory-edit-chevron">›</span>
              </span>
              <select
                className="inventory-edit-native-control"
                aria-label="Unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                <option value="">Not specified</option>
                {hasCustomUnit && <option value={unit}>{titleCase(unit)}</option>}
                {inventoryUnitOptions.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="inventory-edit-field-row">
              <span>Location</span>
              <span className="inventory-edit-row-value" aria-hidden="true">
                {location ? titleCase(location) : "Not specified"}
                <span className="inventory-edit-chevron">›</span>
              </span>
              <select
                className="inventory-edit-native-control"
                aria-label="Location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                <option value="">Not specified</option>
                <option value="fridge">Fridge</option>
                <option value="freezer">Freezer</option>
                <option value="pantry">Pantry</option>
              </select>
            </label>

            <label className="inventory-edit-field-row">
              <span>Expiry</span>
              <span className="inventory-edit-row-value" aria-hidden="true">
                {editorDateLabel(expirationDate)}
                <span className="inventory-edit-chevron">›</span>
              </span>
              <input
                className="inventory-edit-native-control"
                type="date"
                aria-label="Expiry date"
                value={expirationDate}
                onChange={(event) => setExpirationDate(event.target.value)}
              />
            </label>
          </div>

          {validationError && (
            <p className="inventory-edit-error" role="alert">
              {validationError}
            </p>
          )}

          <div className="inventory-edit-actions">
            <button
              className="inventory-edit-cancel"
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="inventory-save-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className={`inventory-item-row${onOpen ? " inventory-item-row-button" : ""}`}>
      {onOpen && (
        <button
          className="inventory-row-hit-area"
          type="button"
          onClick={onOpen}
          aria-label={`Edit ${titleCase(item.item_name)}`}
        />
      )}
      <InventoryArtwork category={category} />
      <div className="inventory-item-copy">
        <strong>{titleCase(item.item_name)}</strong>
        <p>{metadata.join(" · ")}</p>
        {attention && (
          <span className={`inventory-attention attention-${item.expiry_state === "expired" ? "urgent" : item.status}`}>
            {attention}
          </span>
        )}
      </div>
    </article>
  );
}

export type DashboardViewName = "home" | "inventory" | "shopping" | "search";

export function DashboardView({ view }: { view: DashboardViewName }) {
  const [command, setCommand] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [interpretation, setInterpretation] =
    useState<LoggedInterpretation | null>(null);
  const [edited, setEdited] = useState<EditableInterpretation | null>(null);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [homeQuickUpdateOpen, setHomeQuickUpdateOpen] = useState(false);
  const [inventoryFilter, setInventoryFilter] =
    useState<InventoryCategory>("All");
  const [editingInventory, setEditingInventory] = useState(false);
  const [selectedInventoryItemName, setSelectedInventoryItemName] =
    useState<string | null>(null);
  const [inventorySaving, setInventorySaving] = useState<string | null>(null);
  const [shoppingSaving, setShoppingSaving] = useState<string | null>(null);
  const [shoppingAddOpen, setShoppingAddOpen] = useState(false);
  const [shoppingDraft, setShoppingDraft] = useState("");
  const [shoppingQuantityDraft, setShoppingQuantityDraft] = useState("1");
  const [shoppingUnitDraft, setShoppingUnitDraft] = useState("");
  const [shoppingLocationDraft, setShoppingLocationDraft] =
    useState<"" | NonNullable<InventoryItem["location"]>>("fridge");
  const [shoppingExpiryDraft, setShoppingExpiryDraft] = useState("");
  const [revealedShoppingItem, setRevealedShoppingItem] =
    useState<string | null>(null);
  const shoppingAddDialogRef = useRef<HTMLDialogElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const homeQuickUpdateRef = useRef<HTMLElement>(null);

  const attentionItems = useMemo(
    () => dashboard.inventory.filter((item) => attentionLabel(item) !== null),
    [dashboard.inventory],
  );

  const inventoryGroups = useMemo(() => {
    const groups = new Map<ItemCategory, InventoryItem[]>();
    for (const item of dashboard.inventory) {
      const category = inventoryCategory(item.item_name);
      if (inventoryFilter !== "All" && category !== inventoryFilter) continue;
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    return inventoryCategories
      .filter((category): category is ItemCategory => category !== "All")
      .map((category) => ({ category, items: groups.get(category) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [dashboard.inventory, inventoryFilter]);
  const activeShoppingItems = dashboard.shoppingList.filter(
    (item) => item.status === "active",
  );
  const purchasedShoppingItems = dashboard.shoppingList.filter(
    (item) => item.status === "purchased",
  );
  const shoppingItemNames = new Set(
    dashboard.shoppingList.map((item) => item.item_name),
  );
  const recommendedShoppingItems = dashboard.inventory.filter(
    (item) => item.status === "low" && !shoppingItemNames.has(item.item_name),
  );
  const inventoryByItemName = new Map(
    dashboard.inventory.map((item) => [item.item_name, item]),
  );
  const homeBriefing = useMemo(() => {
    const expiring = dashboard.inventory.filter(
      (item) =>
        item.expiry_state === "expired" ||
        item.expiry_state === "expiring_soon",
    );
    const restock = dashboard.inventory.filter(
      (item) => item.status === "low" || item.status === "out",
    );
    const toBuy = dashboard.shoppingList.filter(
      (item) => item.status === "active",
    );

    return [
      {
        eyebrow: "USE SOON",
        title: expiring.length
          ? `${expiring.length} item${expiring.length === 1 ? "" : "s"} need attention`
          : "Nothing expiring soon",
        detail: expiring.length
          ? expiring.slice(0, 2).map((item) => titleCase(item.item_name)).join(", ")
          : "Your dated items look current.",
        href: "/inventory",
        tone: "expiry",
      },
      {
        eyebrow: "RESTOCK",
        title: restock.length
          ? `${restock.length} item${restock.length === 1 ? "" : "s"} running low`
          : "Inventory levels look good",
        detail: restock.length
          ? restock.slice(0, 2).map((item) => titleCase(item.item_name)).join(", ")
          : "No low or out-of-stock items.",
        href: "/inventory",
        tone: "restock",
      },
      {
        eyebrow: "SHOPPING RUN",
        title: toBuy.length
          ? `${toBuy.length} item${toBuy.length === 1 ? "" : "s"} to buy`
          : "Shopping list is clear",
        detail: toBuy.length
          ? toBuy.slice(0, 2).map((item) => titleCase(item.item_name)).join(", ")
          : "Add an item when you need it.",
        href: "/shopping",
        tone: "shopping",
      },
    ];
  }, [dashboard.inventory, dashboard.shoppingList]);
  const recentlyUpdated = useMemo(() => {
    const latestByItem = new Map<string, EventRecord>();
    for (const event of dashboard.events) {
      if (!latestByItem.has(event.item_name)) {
        latestByItem.set(event.item_name, event);
      }
    }
    return [...latestByItem.values()].slice(0, 10);
  }, [dashboard.events]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      if (view === "inventory" || view === "search") {
        const inventory = await getInventoryData();
        setDashboard({ ...emptyDashboard, inventory });
      } else if (view === "shopping") {
        const [inventory, shoppingList] = await Promise.all([
          getInventoryData(),
          getShoppingListData(),
        ]);
        setDashboard({ ...emptyDashboard, inventory, shoppingList });
      } else {
        setDashboard(await getDashboardData());
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load kitchen data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [view]);

  useEffect(() => {
    if (view !== "home" || !homeQuickUpdateOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      commandInputRef.current?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHomeQuickUpdateOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [homeQuickUpdateOpen, view]);

  useEffect(() => {
    const dialog = shoppingAddDialogRef.current;
    if (!dialog) return;

    if (shoppingAddOpen && !dialog.open) {
      dialog.showModal();
    } else if (!shoppingAddOpen && dialog.open) {
      dialog.close();
    }
  }, [shoppingAddOpen]);

  async function handleSaveInventoryItem(
    itemName: string,
    update: Parameters<typeof updateInventoryItem>[1],
  ) {
    setInventorySaving(itemName);
    setError(null);
    try {
      await updateInventoryItem(itemName, update);
      await loadDashboard();
      setSelectedInventoryItemName(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update item.");
    } finally {
      setInventorySaving(null);
    }
  }

  async function handleRemoveInventoryItem(itemName: string) {
    setInventorySaving(itemName);
    setError(null);
    try {
      await removeInventoryItem(itemName);
      await loadDashboard();
      setSelectedInventoryItemName(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove item.");
    } finally {
      setInventorySaving(null);
    }
  }

  async function handleShoppingStatus(
    itemName: string,
    status: "active" | "purchased",
  ) {
    setShoppingSaving(itemName);
    setRevealedShoppingItem(null);
    setError(null);
    try {
      const result = status === "active"
        ? await markShoppingItemPurchased(itemName)
        : await restoreShoppingItem(itemName);
      setDashboard((current) => ({
        ...current,
        inventory: result.inventory,
        shoppingList: result.items,
      }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update the shopping list.",
      );
    } finally {
      setShoppingSaving(null);
    }
  }

  async function handleDeleteShoppingItem(itemName: string) {
    setShoppingSaving(itemName);
    setRevealedShoppingItem(null);
    setError(null);
    try {
      const result = await deleteShoppingItem(itemName);
      setDashboard((current) => ({
        ...current,
        inventory: result.inventory,
        shoppingList: result.items,
      }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the shopping item.",
      );
    } finally {
      setShoppingSaving(null);
    }
  }

  function resetShoppingDraft() {
    setShoppingDraft("");
    setShoppingQuantityDraft("1");
    setShoppingUnitDraft("");
    setShoppingLocationDraft("fridge");
    setShoppingExpiryDraft("");
  }

  async function handleAddRecommendation(item: InventoryItem) {
    setShoppingSaving(item.item_name);
    setError(null);
    try {
      await addShoppingItem(item.item_name, {
        quantity: 1,
        unit: item.unit,
        location: item.location,
        expiration_date: null,
      });
      const shoppingList = await getShoppingListData();
      setDashboard((current) => ({ ...current, shoppingList }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add the recommendation.",
      );
    } finally {
      setShoppingSaving(null);
    }
  }

  async function handleManualShoppingAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const itemName = canonicalItemName(shoppingDraft);
    const quantity = Number(shoppingQuantityDraft);
    if (!itemName || !Number.isFinite(quantity) || quantity <= 0) return;

    setShoppingSaving(itemName);
    setError(null);
    try {
      await addShoppingItem(itemName, {
        quantity,
        unit: shoppingUnitDraft.trim() || null,
        location: shoppingLocationDraft || null,
        expiration_date: shoppingExpiryDraft || null,
      });
      const shoppingList = await getShoppingListData();
      setDashboard((current) => ({ ...current, shoppingList }));
      resetShoppingDraft();
      setShoppingAddOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add the item.",
      );
    } finally {
      setShoppingSaving(null);
    }
  }

  async function handleInterpret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim()) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await interpretCommand(
        command.trim(),
        expiryDate || undefined,
      );
      setInterpretation(result);
      setEdited(toEditable(result));

      if (result.intent === "query_inventory" && result.slots.item_name) {
        const item = dashboard.inventory.find(
          (entry) => entry.item_name === result.slots.item_name,
        );
        setNotice(
          item
            ? `${titleCase(item.item_name)} is ${titleCase(item.status)}.`
            : `${titleCase(result.slots.item_name)} is not in the inventory.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not interpret command.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!interpretation || !edited) return;
    const reviewedInterpretation = {
      intent: edited.intent,
      slots: {
        ...(edited.itemName.trim()
          ? { item_name: edited.itemName.trim().toLowerCase() }
          : {}),
        ...(edited.quantity ? { quantity: Number(edited.quantity) } : {}),
        ...(edited.lowThreshold
          ? { low_threshold: Number(edited.lowThreshold) }
          : {}),
        ...(edited.unit.trim() ? { unit: edited.unit.trim().toLowerCase() } : {}),
        ...(edited.location ? { location: edited.location } : {}),
        ...(edited.expirationDate
          ? { expiration_date: edited.expirationDate }
          : {}),
      },
      confidence: interpretation.confidence,
      requires_confirmation: true,
      raw_utterance: interpretation.raw_utterance,
    };
    if (edited.intent === "needs_clarification") {
      setSubmitting(true);
      setError(null);
      try {
        await updateInferenceOutcome({
          inference_id: interpretation.inference_id,
          outcome: "rejected",
          reviewed_interpretation: reviewedInterpretation,
        });
        setInterpretation(null);
        setEdited(null);
        setCommand("");
        setNotice("Saved as a request that needs clarification.");
        if (view === "home") setHomeQuickUpdateOpen(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save review.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!edited.itemName.trim()) return;
    const eventType = eventTypeByIntent[edited.intent];
    if (!eventType) return;

    const quantity = edited.quantity ? Number(edited.quantity) : null;
    const lowThreshold = edited.lowThreshold
      ? Number(edited.lowThreshold)
      : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setError("Quantity must be a number greater than zero.");
      return;
    }
    if (
      edited.intent === "set_low_threshold" &&
      (lowThreshold === null ||
        !Number.isFinite(lowThreshold) ||
        lowThreshold <= 0)
    ) {
      setError("Low threshold must be a number greater than zero.");
      return;
    }

    const payload: CreateEventRequest = {
      event_type: eventType,
      item_name: edited.itemName.trim().toLowerCase(),
      quantity: edited.intent === "set_low_threshold" ? null : quantity,
      unit: edited.unit.trim().toLowerCase() || null,
      location: edited.location || null,
      expiration_date: edited.expirationDate || null,
      low_threshold:
        edited.intent === "set_low_threshold" ? lowThreshold : null,
      raw_utterance: interpretation.raw_utterance,
      confidence: interpretation.confidence,
      source: "web",
    };

    setSubmitting(true);
    setError(null);

    try {
      await createEvent({
        inference_id: interpretation.inference_id,
        event: payload,
        original_interpretation: {
          intent: interpretation.intent,
          slots: interpretation.slots,
          confidence: interpretation.confidence,
          requires_confirmation: interpretation.requires_confirmation,
          raw_utterance: interpretation.raw_utterance,
        },
        parser_version: "rules-v2",
      });
      setCommand("");
      setExpiryDate("");
      setInterpretation(null);
      setEdited(null);
      setNotice(`${titleCase(payload.item_name)} updated.`);
      await loadDashboard();
      if (view === "home") setHomeQuickUpdateOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the action.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!interpretation) return;
    try {
      await updateInferenceOutcome({
        inference_id: interpretation.inference_id,
        outcome: "cancelled",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not log cancellation.");
      return;
    }
    setInterpretation(null);
    setEdited(null);
  }

  const canConfirm =
    interpretation &&
    edited &&
    (edited.intent === "needs_clarification" ||
      (edited.itemName.trim() &&
        eventTypeByIntent[edited.intent] &&
        (edited.intent !== "set_low_threshold" || edited.lowThreshold)));

  return (
    <main id={view}>
      {view === "home" && (
        <div className="home-overview">
          <header className="home-titlebar">
            <h1>Home</h1>
            <span
              className="home-profile-placeholder"
              role="img"
              aria-label="Account profile placeholder"
              title="Account profiles are planned"
            >
              <CircleUserRound size={30} strokeWidth={1.75} />
            </span>
          </header>

          <section className="home-section" aria-labelledby="briefing-heading">
            <div className="home-section-heading">
              <h2 id="briefing-heading">Kitchen Briefing</h2>
            </div>
            {loading ? (
              <p className="home-loading">Loading kitchen status…</p>
            ) : (
              <div className="home-feature-scroll">
                {homeBriefing.map((briefing) => (
                  <a
                    className={`home-feature-card tone-${briefing.tone}`}
                    href={briefing.href}
                    key={briefing.eyebrow}
                  >
                    <span>{briefing.eyebrow}</span>
                    <strong>{briefing.title}</strong>
                    <p>{briefing.detail}</p>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="recent-heading">
            <div className="home-section-heading">
              <h2 id="recent-heading">Recently Updated</h2>
            </div>
            {loading ? (
              <p className="home-loading">Loading recent updates…</p>
            ) : recentlyUpdated.length === 0 ? (
              <p className="home-empty">
                Confirmed inventory and shopping actions will appear here.
              </p>
            ) : (
              <div className="home-update-scroll">
                {recentlyUpdated.map((event) => (
                  <article className="home-update-card" key={event.id}>
                    <HomeArtwork itemName={event.item_name} />
                    <strong>{titleCase(event.item_name)}</strong>
                    <p>
                      {recentUpdateLabel(
                        event,
                        inventoryByItemName.get(event.item_name),
                      )}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {(view === "home" || view === "search") && (
      <>
      {view === "home" && homeQuickUpdateOpen && (
        <button
          className="home-quick-update-backdrop"
          type="button"
          aria-label="Close Quick Update"
          onClick={() => setHomeQuickUpdateOpen(false)}
        />
      )}
      <section
        className={`command-band${
          view === "home" ? " home-quick-update-dialog" : ""
        }`}
        id="command"
        aria-labelledby="command-heading"
        role={view === "home" ? "dialog" : undefined}
        aria-modal={view === "home" ? true : undefined}
        hidden={view === "home" && !homeQuickUpdateOpen}
        ref={view === "home" ? homeQuickUpdateRef : undefined}
        onKeyDown={
          view === "home"
            ? (event) => {
                if (event.key !== "Tab") return;
                const focusable =
                  homeQuickUpdateRef.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
                  );
                if (!focusable?.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (
                  !event.shiftKey &&
                  document.activeElement === last
                ) {
                  event.preventDefault();
                  first.focus();
                }
              }
            : undefined
        }
      >
        <div className="section-heading">
          {view === "search" && <p className="eyebrow">Kitchen command</p>}
          {view === "home" ? (
            <>
              <h2 id="command-heading">Quick Update</h2>
              <button
                className="home-quick-update-close"
                type="button"
                aria-label="Close Quick Update"
                onClick={() => setHomeQuickUpdateOpen(false)}
              >
                <X size={20} />
              </button>
            </>
          ) : (
            <h1 id="command-heading">What changed?</h1>
          )}
        </div>

        <form onSubmit={handleInterpret} className="command-form">
          <label className="field command-field">
            <span>English command</span>
            <div className="command-input-wrap">
              <input
                ref={view === "home" ? commandInputRef : undefined}
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                  setInterpretation(null);
                  setEdited(null);
                  setNotice(null);
                }}
                placeholder="We are low on milk"
                maxLength={500}
                autoComplete="off"
              />
              <button
                className="primary-icon-button"
                type="submit"
                disabled={submitting || !command.trim()}
                title="Interpret command"
                aria-label="Interpret command"
              >
                {submitting ? (
                  <LoaderCircle size={20} className="spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </label>

          <label className="field expiry-field">
            <span>
              <CalendarDays size={16} />
              Expiry date <small>optional</small>
            </span>
            <input
              type="date"
              value={expiryDate}
              onChange={(event) => {
                setExpiryDate(event.target.value);
                setInterpretation(null);
                setEdited(null);
              }}
            />
          </label>
        </form>

        <div className="examples" aria-label="Example commands">
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => {
                setCommand(example);
                setInterpretation(null);
                setEdited(null);
                setNotice(null);
              }}
            >
              {example}
            </button>
          ))}
        </div>

        {error && <p className="message error">{error}</p>}
        {notice && <p className="message notice">{notice}</p>}

        {interpretation && (
          <div className="interpretation" aria-live="polite">
            <div className="interpretation-main">
              <span className={`intent intent-${interpretation.intent}`}>
                {titleCase(interpretation.intent)}
              </span>
              <p className="review-hint">
                Review every field. Fix anything the parser misunderstood before
                saving.
              </p>
              {edited && (
                <div className="correction-grid">
                  <label className="field">
                    <span>Action</span>
                    <select
                      value={edited.intent}
                      onChange={(event) =>
                        setEdited({
                          ...edited,
                          intent: event.target.value as Intent,
                        })
                      }
                    >
                      {(edited.intent === "unknown" ||
                        edited.intent === "query_inventory") && (
                        <option value={edited.intent}>Choose an action</option>
                      )}
                      {editableIntents.map((intent) => (
                        <option key={intent} value={intent}>
                          {titleCase(intent)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Item</span>
                    <input
                      required
                      maxLength={120}
                      value={edited.itemName}
                      onChange={(event) =>
                        setEdited({ ...edited, itemName: event.target.value })
                      }
                    />
                  </label>
                  {edited.intent === "set_low_threshold" ? (
                    <label className="field">
                      <span>Low threshold</span>
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="any"
                        value={edited.lowThreshold}
                        onChange={(event) =>
                          setEdited({
                            ...edited,
                            lowThreshold: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span>
                        Quantity <small>optional</small>
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={edited.quantity}
                        onChange={(event) =>
                          setEdited({ ...edited, quantity: event.target.value })
                        }
                      />
                    </label>
                  )}
                  <label className="field">
                    <span>
                      Unit <small>optional</small>
                    </span>
                    <input
                      maxLength={40}
                      value={edited.unit}
                      onChange={(event) =>
                        setEdited({ ...edited, unit: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      Location <small>optional</small>
                    </span>
                    <select
                      value={edited.location}
                      onChange={(event) =>
                        setEdited({
                          ...edited,
                          location: event.target
                            .value as EditableInterpretation["location"],
                        })
                      }
                    >
                      <option value="">Not specified</option>
                      <option value="fridge">Fridge</option>
                      <option value="freezer">Freezer</option>
                      <option value="pantry">Pantry</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Expiry date <small>optional</small>
                    </span>
                    <input
                      type="date"
                      value={edited.expirationDate}
                      onChange={(event) =>
                        setEdited({
                          ...edited,
                          expirationDate: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <span className="confidence">
                {Math.round(interpretation.confidence * 100)}% confidence
              </span>
            </div>

            <div className="interpretation-actions">
              <button
                className="icon-button"
                type="button"
                onClick={() => void handleCancel()}
                title="Cancel action"
                aria-label="Cancel action"
              >
                <X size={19} />
              </button>
              {canConfirm && (
                <button
                  className="confirm-button"
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={submitting}
                >
                  <Check size={18} />
                  {edited?.intent === "needs_clarification"
                    ? "Save review"
                    : "Confirm"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      {view === "home" && (
        <div className="home-mini-player">
          <button
            type="button"
            onClick={() => setHomeQuickUpdateOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={homeQuickUpdateOpen}
            aria-controls="command"
          >
            <span className="home-mini-player-artwork" aria-hidden="true">
              <Mic size={22} strokeWidth={2} />
            </span>
            <span className="home-mini-player-copy">
              <strong>Tell Jangoing what changed</strong>
              <small>Quick Update</small>
            </span>
            <span className="home-mini-player-action" aria-hidden="true">
              <ChevronUp size={22} strokeWidth={2} />
            </span>
          </button>
        </div>
      )}
      </>
      )}

      {(view === "inventory" || view === "shopping") && (
      <div className={`dashboard-grid dashboard-grid-${view}`}>
        {view === "inventory" && (
        <section className="data-section inventory-section" id="inventory">
          <div className="inventory-titlebar">
            <div>
              <h2>Inventory</h2>
            </div>
            <button
              className="inventory-edit-toggle"
              type="button"
              aria-pressed={editingInventory}
              disabled={inventorySaving !== null}
              onClick={() => {
                setEditingInventory((current) => !current);
                setSelectedInventoryItemName(null);
              }}
            >
              {editingInventory ? "Done" : "Edit"}
            </button>
          </div>

          {error && <p className="message error inventory-message">{error}</p>}

          {loading ? (
            <p className="empty-state inventory-empty">Loading inventory...</p>
          ) : dashboard.inventory.length === 0 ? (
            <p className="empty-state inventory-empty">No inventory actions yet.</p>
          ) : (
            <div className="inventory-library">
              {attentionItems.length > 0 && !editingInventory && (
                <section className="inventory-attention-section" aria-labelledby="attention-heading">
                  <div className="inventory-section-heading">
                    <h3 id="attention-heading">Needs Attention</h3>
                    <span>{attentionItems.length}</span>
                  </div>
                  <div className="inventory-list">
                    {attentionItems.map((item) => (
                      <InventoryItemRow
                        item={item}
                        key={`attention-${item.item_name}`}
                      />
                    ))}
                  </div>
                </section>
              )}

              <div className="inventory-filters" role="group" aria-label="Filter inventory by category">
                {inventoryCategories.map((category) => (
                  <button
                    className={inventoryFilter === category ? "is-selected" : undefined}
                    key={category}
                    type="button"
                    aria-pressed={inventoryFilter === category}
                    onClick={() => {
                      setInventoryFilter(category);
                      setSelectedInventoryItemName(null);
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="inventory-category-groups">
                {inventoryGroups.length === 0 ? (
                  <p className="empty-state inventory-empty">No items in this category.</p>
                ) : inventoryGroups.map(({ category, items }) => (
                  <section
                    className="inventory-category"
                    key={category}
                    aria-labelledby={`category-${category.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
                  >
                    <div className="inventory-section-heading">
                      <h3 id={`category-${category.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
                        {category}
                      </h3>
                      <span>{items.length}</span>
                    </div>
                    <div className="inventory-list">
                      {items.map((item) => (
                        <InventoryItemRow
                          item={item}
                          key={item.item_name}
                          editing={
                            editingInventory &&
                            selectedInventoryItemName === item.item_name
                          }
                          busy={inventorySaving === item.item_name}
                          onOpen={
                            editingInventory
                              ? () => setSelectedInventoryItemName(item.item_name)
                              : undefined
                          }
                          onCancel={() => setSelectedInventoryItemName(null)}
                          onSave={(update) =>
                            handleSaveInventoryItem(item.item_name, update)
                          }
                          onRemove={() => handleRemoveInventoryItem(item.item_name)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {view === "shopping" && (
        <section className="data-section shopping-section" id="shopping">
          <div className="shopping-titlebar">
            <h2>Shopping List</h2>
            <button
              className="shopping-add-trigger"
              type="button"
              aria-expanded={shoppingAddOpen}
              aria-controls="shopping-add-dialog"
              onClick={() => {
                resetShoppingDraft();
                setError(null);
                setShoppingAddOpen(true);
              }}
            >
              + Add
            </button>
          </div>

          {error && !shoppingAddOpen && (
            <p className="message error shopping-message">{error}</p>
          )}

          <dialog
            className="shopping-add-dialog"
            id="shopping-add-dialog"
            ref={shoppingAddDialogRef}
            aria-labelledby="shopping-add-dialog-title"
            onCancel={() => setShoppingAddOpen(false)}
            onClose={() => setShoppingAddOpen(false)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShoppingAddOpen(false);
              }
            }}
          >
            <form
              className="shopping-add-dialog-form"
              onSubmit={handleManualShoppingAdd}
            >
              <div className="shopping-add-dialog-header">
                <button
                  type="button"
                  onClick={() => {
                    resetShoppingDraft();
                    setError(null);
                    setShoppingAddOpen(false);
                  }}
                >
                  Cancel
                </button>
                <h3 id="shopping-add-dialog-title">Add Item</h3>
                <button
                  type="submit"
                  disabled={!shoppingDraft.trim() || shoppingSaving !== null}
                >
                  {shoppingSaving !== null ? "Adding…" : "Add"}
                </button>
              </div>
              <div className="shopping-add-fields">
                <label>
                  <span>Item</span>
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    autoComplete="off"
                    placeholder="e.g. Oat milk"
                    value={shoppingDraft}
                    onChange={(event) => setShoppingDraft(event.target.value)}
                  />
                </label>
                <label>
                  <span>Quantity</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={shoppingQuantityDraft}
                    onChange={(event) =>
                      setShoppingQuantityDraft(event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Unit</span>
                  <input
                    maxLength={40}
                    placeholder="Optional"
                    value={shoppingUnitDraft}
                    onChange={(event) => setShoppingUnitDraft(event.target.value)}
                  />
                </label>
                <label>
                  <span>Location</span>
                  <select
                    value={shoppingLocationDraft}
                    onChange={(event) =>
                      setShoppingLocationDraft(
                        event.target.value as typeof shoppingLocationDraft,
                      )
                    }
                  >
                    <option value="">Not set</option>
                    <option value="fridge">Fridge</option>
                    <option value="freezer">Freezer</option>
                    <option value="pantry">Pantry</option>
                  </select>
                </label>
                <label>
                  <span>Expiry</span>
                  <input
                    type="date"
                    value={shoppingExpiryDraft}
                    onChange={(event) =>
                      setShoppingExpiryDraft(event.target.value)
                    }
                  />
                </label>
              </div>
              <p>This context will be added to Inventory when marked purchased.</p>
              {error && <p className="shopping-add-dialog-error">{error}</p>}
            </form>
          </dialog>

          {loading ? (
            <p className="empty-state shopping-empty">Loading shopping list...</p>
          ) : dashboard.shoppingList.length === 0 &&
            recommendedShoppingItems.length === 0 ? (
            <p className="empty-state shopping-empty">Nothing to buy yet.</p>
          ) : (
            <div className="shopping-queue">
              {recommendedShoppingItems.length > 0 && (
                <section
                  className="shopping-recommendations"
                  aria-labelledby="shopping-recommendations-heading"
                >
                  <div className="shopping-section-heading">
                    <div>
                      <h3 id="shopping-recommendations-heading">
                        Suggested from Inventory
                      </h3>
                      <small>Items currently marked Low</small>
                    </div>
                    <span>{recommendedShoppingItems.length}</span>
                  </div>
                  <ul className="shopping-track-list shopping-suggestion-list">
                    {recommendedShoppingItems.map((item) => (
                      <li key={item.item_name}>
                        <ShoppingArtwork itemName={item.item_name} />
                        <div className="shopping-suggestion-copy">
                          <strong>{titleCase(item.item_name)}</strong>
                          <small>Low stock · {quantityLabel(item)}</small>
                        </div>
                        <button
                          className="shopping-add-button"
                          type="button"
                          aria-label={`Add ${titleCase(item.item_name)} to shopping list`}
                          disabled={shoppingSaving === item.item_name}
                          onClick={() =>
                            void handleAddRecommendation(item)
                          }
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="shopping-active-heading">
                <div className="shopping-section-heading">
                  <div>
                    <h3 id="shopping-active-heading">To Buy</h3>
                    <small>Swipe left for Done or Delete</small>
                  </div>
                  <span>{activeShoppingItems.length}</span>
                </div>
                {activeShoppingItems.length === 0 ? (
                  <p className="shopping-section-empty">Nothing left to buy.</p>
                ) : (
                  <ul className="shopping-track-list">
                    {activeShoppingItems.map((item) => (
                      <ShoppingSwipeRow
                        key={item.item_name}
                        itemName={item.item_name}
                        secondaryText={[
                          shoppingInventoryStatusLabel(
                            inventoryByItemName.get(item.item_name),
                          ),
                          shoppingPurchaseContextLabel(item),
                        ].join(" · ")}
                        actionLabel="Done"
                        busy={shoppingSaving === item.item_name}
                        open={revealedShoppingItem === item.item_name}
                        onOpenChange={(open) =>
                          setRevealedShoppingItem(open ? item.item_name : null)
                        }
                        onAction={() =>
                          void handleShoppingStatus(item.item_name, item.status)
                        }
                        onDelete={() =>
                          void handleDeleteShoppingItem(item.item_name)
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>

              {purchasedShoppingItems.length > 0 && (
                <section
                  className="shopping-purchased-section"
                  aria-labelledby="shopping-purchased-heading"
                >
                  <div className="shopping-section-heading">
                    <div>
                      <h3 id="shopping-purchased-heading">Purchased</h3>
                      <small>Clears after 24 hours</small>
                    </div>
                    <span>{purchasedShoppingItems.length}</span>
                  </div>
                  <ul className="shopping-track-list">
                    {purchasedShoppingItems.map((item) => (
                      <ShoppingSwipeRow
                        key={item.item_name}
                        itemName={item.item_name}
                        secondaryText={shoppingPurchaseDateLabel(
                          item.purchased_at ?? item.added_at,
                        )}
                        actionLabel="Undo"
                        purchased
                        busy={shoppingSaving === item.item_name}
                        open={revealedShoppingItem === item.item_name}
                        onOpenChange={(open) =>
                          setRevealedShoppingItem(open ? item.item_name : null)
                        }
                        onAction={() =>
                          void handleShoppingStatus(item.item_name, item.status)
                        }
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </section>
        )}

      </div>
      )}

    </main>
  );
}

export default function Home() {
  return <DashboardView view="home" />;
}
