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
  Camera,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Lightbulb,
  LoaderCircle,
  Mic,
  PackageOpen,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  addShoppingItem,
  createEvent,
  deleteShoppingItem,
  getInventoryData,
  getShoppingListData,
  interpretCommand,
  markShoppingItemPurchased,
  removeItemThumbnail,
  removeInventoryItem,
  restoreShoppingItem,
  uploadItemThumbnail,
  updateInventoryItem,
  updateInferenceOutcome,
} from "../lib/api";
import { prepareItemThumbnailDataUrl } from "../lib/item-thumbnail";
import { hasInventoryItemChanges } from "../lib/inventory-update";
import {
  inventoryHref,
  parseInventoryNavigation,
  type InventoryScope,
} from "../lib/inventory-navigation";
import {
  inventoryCategories,
  inventoryCategory,
  resolvedInventoryCategory,
  storedCategoryLabels,
  storedCategoryOptions,
  type InventoryCategory,
  type ItemCategory,
  type StoredInventoryCategory,
} from "../lib/inventory-category";
import { FridgeSetupDialog } from "./FridgeSetupDialog";
import { AccountButton } from "./AccountButton";
import { useKitchenData } from "./KitchenDataContext";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { RouteTransitionLink } from "./RouteTransitionLink";

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
const oldInventoryThresholdDays = 14;

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

function matchesInventoryScope(
  item: InventoryItem,
  scope: InventoryScope,
): boolean {
  if (scope === "low") return item.status === "low";
  if (scope === "out") return item.status === "out" || item.quantity <= 0;
  if (scope === "expiring") {
    return (
      item.expiry_state === "expired" ||
      item.expiry_state === "expiring_soon"
    );
  }
  if (scope === "restock") {
    return item.status === "low" || item.status === "out" || item.quantity <= 0;
  }
  return true;
}

function inventoryItemElementId(itemName: string): string {
  return `inventory-item-${encodeURIComponent(itemName)}`;
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

function inventoryAddedDateLabel(value: string): string {
  return `Added ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value))}`;
}

function inventoryAgeDays(value: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}

function oldInventoryLabel(value: string): string {
  const ageDays = inventoryAgeDays(value);
  if (ageDays === 0) return "Added today";
  if (ageDays === 1) return "Added yesterday";
  if (ageDays < 14) return `Added ${ageDays} days ago`;
  if (ageDays < 60) {
    const weeks = Math.floor(ageDays / 7);
    return `Added ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  const months = Math.floor(ageDays / 30);
  return `Added ${months} month${months === 1 ? "" : "s"} ago`;
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

const shoppingSwipeActionWidth = 74;

function ArtworkLabel({
  itemName,
  compact = false,
}: {
  itemName: string;
  compact?: boolean;
}) {
  const maximumSize = compact ? 10 : 20;
  const minimumSize = compact ? 5 : 8;
  const labelRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maximumSize);

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;

    function fitLabel() {
      if (!label) return;
      const renderedSize = Number.parseFloat(getComputedStyle(label).fontSize);
      const words = [...label.querySelectorAll<HTMLElement>(".artwork-word")];
      const widestWord = Math.max(...words.map((word) => word.scrollWidth), 1);
      const labelStyle = getComputedStyle(label);
      const availableWidth = label.clientWidth
        - Number.parseFloat(labelStyle.paddingLeft)
        - Number.parseFloat(labelStyle.paddingRight);
      const fittedSize = Math.max(
        minimumSize,
        Math.min(
          maximumSize,
          Math.floor(renderedSize * (availableWidth / widestWord)),
        ),
      );
      setFontSize(fittedSize);
    }

    fitLabel();
    const resizeObserver = new ResizeObserver(fitLabel);
    resizeObserver.observe(label.parentElement ?? label);
    void document.fonts?.ready.then(fitLabel);
    return () => resizeObserver.disconnect();
  }, [compact, itemName, maximumSize, minimumSize]);

  return (
    <span ref={labelRef} style={{ fontSize: `${fontSize}px` }}>
      {titleCase(itemName).split(" ").map((word, index) => (
        <span className="artwork-word" key={`${word}-${index}`}>
          {word}
        </span>
      ))}
    </span>
  );
}

function ShoppingArtwork({
  itemName,
  thumbnailUrl,
}: {
  itemName: string;
  thumbnailUrl?: string | null;
}) {
  const category = inventoryCategory(itemName);
  const categoryClass = category
    .toLowerCase()
    .replaceAll(" & ", "-")
    .replaceAll(" ", "-");

  return (
    <div
      className={`shopping-artwork category-${categoryClass}`}
      aria-hidden="true"
    >
      {thumbnailUrl ? (
        <img className="item-artwork-image" src={thumbnailUrl} alt="" />
      ) : (
        <ArtworkLabel compact itemName={itemName} />
      )}
    </div>
  );
}

function ShoppingSwipeRow({
  itemName,
  thumbnailUrl,
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
  thumbnailUrl?: string | null;
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
        <ShoppingArtwork itemName={itemName} thumbnailUrl={thumbnailUrl} />
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

function InventoryArtwork({
  itemName,
  thumbnailUrl,
  interactive = false,
  showCaptureAffordance = false,
  uploading = false,
}: {
  itemName: string;
  thumbnailUrl?: string | null;
  interactive?: boolean;
  showCaptureAffordance?: boolean;
  uploading?: boolean;
}) {
  return (
    <div
      className={`inventory-artwork${interactive ? " inventory-artwork-interactive" : ""}`}
      aria-hidden="true"
    >
      {thumbnailUrl ? (
        <>
          <img className="item-artwork-image" src={thumbnailUrl} alt="" />
          <div className="inventory-artwork-overlay">
            <ArtworkLabel itemName={itemName} />
          </div>
        </>
      ) : (
        <>
          <ArtworkLabel itemName={itemName} />
        </>
      )}
      {(uploading || (!thumbnailUrl && showCaptureAffordance)) && (
        <span className="inventory-artwork-corner-indicator">
          {uploading ? (
            <LoaderCircle
              className="inventory-artwork-corner-spinner"
              size={14}
              strokeWidth={2.2}
            />
          ) : (
            <Camera size={14} strokeWidth={2.2} />
          )}
        </span>
      )}
    </div>
  );
}

function HomeArtwork({
  itemName,
  thumbnailUrl,
  category: providedCategory,
}: {
  itemName: string;
  thumbnailUrl?: string | null;
  category?: ItemCategory;
}) {
  if (thumbnailUrl) {
    return (
      <div className="home-update-artwork" aria-hidden="true">
        <img className="item-artwork-image" src={thumbnailUrl} alt="" />
      </div>
    );
  }

  const category = providedCategory ?? inventoryCategory(itemName);
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
  selecting = false,
  selected = false,
  busy = false,
  onOpen,
  onSelect,
  onCancel,
  onSave,
  onRemove,
  shoppingState,
  onAddToShopping,
  acknowledging = false,
  onAcknowledge,
  onReplaceThumbnail,
  onRemoveThumbnail,
  domId,
}: {
  item: InventoryItem;
  editing?: boolean;
  selecting?: boolean;
  selected?: boolean;
  busy?: boolean;
  onOpen?: () => void;
  onSelect?: () => void;
  onCancel?: () => void;
  onSave?: (update: {
    quantity: number;
    unit: string | null;
    location: InventoryItem["location"];
    expiration_date: string | null;
    low_threshold: number | null;
    category: InventoryItem["category"];
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
  shoppingState?: "available" | "adding" | "added";
  onAddToShopping?: () => Promise<void>;
  acknowledging?: boolean;
  onAcknowledge?: () => Promise<void>;
  onReplaceThumbnail?: (thumbnailUrl: string) => Promise<void>;
  onRemoveThumbnail?: () => Promise<void>;
  domId?: string;
}) {
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
  const [category, setCategory] = useState(item.category ?? "");
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    item.thumbnail_url ?? null,
  );
  const [quickThumbnailUploading, setQuickThumbnailUploading] = useState(false);
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
    setCategory(item.category ?? "");
    setThumbnailPreview(item.thumbnail_url ?? null);
    setValidationError(null);
  }, [
    editing,
    item.location,
    item.category,
    item.low_threshold,
    item.nearest_expiration_date,
    item.quantity,
    item.thumbnail_url,
    item.unit,
  ]);

  async function handleThumbnailFile(file: File | null) {
    if (!file || !onReplaceThumbnail) return;
    try {
      const thumbnailUrl = await prepareItemThumbnailDataUrl(file);
      setThumbnailPreview(thumbnailUrl);
      await onReplaceThumbnail(thumbnailUrl);
      setValidationError(null);
    } catch (caught) {
      setThumbnailPreview(item.thumbnail_url ?? null);
      setValidationError(
        caught instanceof Error
          ? caught.message
          : "Could not update the item photo.",
      );
    }
  }

  async function handleQuickThumbnailFile(file: File | null) {
    if (!file || !onReplaceThumbnail) return;
    setQuickThumbnailUploading(true);
    try {
      const thumbnailUrl = await prepareItemThumbnailDataUrl(file);
      await onReplaceThumbnail(thumbnailUrl);
    } catch {
      // The parent handler already surfaces the error state.
    } finally {
      setQuickThumbnailUploading(false);
    }
  }

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
      <article
        className="inventory-item-row is-editing"
        id={domId}
        tabIndex={domId ? -1 : undefined}
      >
        <div className="inventory-edit-artwork-panel">
          <InventoryArtwork
            itemName={item.item_name}
            thumbnailUrl={thumbnailPreview}
          />
          <div className="inventory-edit-artwork-actions">
            <label className="inventory-photo-button">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={(event) => {
                  const [file] = event.target.files ?? [];
                  event.currentTarget.value = "";
                  void handleThumbnailFile(file ?? null);
                }}
              />
              Choose Photo
            </label>
            <label className="inventory-photo-button">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture="environment"
                onChange={(event) => {
                  const [file] = event.target.files ?? [];
                  event.currentTarget.value = "";
                  void handleThumbnailFile(file ?? null);
                }}
              />
              Take Photo
            </label>
            {thumbnailPreview && (
              <button
                className="inventory-photo-button is-secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  const previous = item.thumbnail_url ?? null;
                  setThumbnailPreview(null);
                  void onRemoveThumbnail?.().catch((caught) => {
                    setThumbnailPreview(previous);
                    setValidationError(
                      caught instanceof Error
                        ? caught.message
                        : "Could not remove the item photo.",
                    );
                  });
                }}
              >
                Remove Photo
              </button>
            )}
          </div>
        </div>
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
              category: category
                ? category as StoredInventoryCategory
                : null,
            });
          }}
        >
          <div className="inventory-edit-header">
            <strong>{titleCase(item.item_name)}</strong>
            <button
              className="inventory-edit-remove"
              type="button"
              aria-label={`Delete ${titleCase(item.item_name)} from inventory`}
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${titleCase(item.item_name)} from inventory?`,
                  )
                ) {
                  void onRemove?.();
                }
              }}
            >
              <Trash2 aria-hidden="true" size={18} strokeWidth={2} />
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
              <span>Category</span>
              <span className="inventory-edit-row-value" aria-hidden="true">
                {category
                  ? storedCategoryLabels[category as StoredInventoryCategory]
                  : `Automatic (${inventoryCategory(item.item_name)})`}
                <span className="inventory-edit-chevron">›</span>
              </span>
              <select
                className="inventory-edit-native-control"
                aria-label="Category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as StoredInventoryCategory | "")
                }
              >
                <option value="">
                  Automatic ({inventoryCategory(item.item_name)})
                </option>
                {storedCategoryOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
    <article
      className={`inventory-item-row${onOpen || onSelect ? " inventory-item-row-button" : ""}${selecting ? " is-selecting" : ""}${selected ? " is-selected" : ""}`}
      id={domId}
      tabIndex={domId ? -1 : undefined}
    >
      {(onOpen || onSelect) && (
        <button
          className="inventory-row-hit-area"
          type="button"
          onClick={selecting ? onSelect : onOpen}
          aria-label={
            selecting
              ? `${selected ? "Deselect" : "Select"} ${titleCase(item.item_name)}`
              : `Edit ${titleCase(item.item_name)}`
          }
          aria-pressed={selecting ? selected : undefined}
        />
      )}
      {selecting && (
        <span className="inventory-selection-control" aria-hidden="true">
          {selected && <Check size={16} strokeWidth={3} />}
        </span>
      )}
      {onReplaceThumbnail && !selecting ? (
        <label className="inventory-artwork-button">
          <InventoryArtwork
            itemName={item.item_name}
            thumbnailUrl={item.thumbnail_url}
            interactive
            showCaptureAffordance
            uploading={quickThumbnailUploading || busy}
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            disabled={busy || quickThumbnailUploading}
            aria-label={`${item.thumbnail_url ? "Change" : "Add"} photo for ${titleCase(item.item_name)}`}
            onChange={(event) => {
              const [file] = event.target.files ?? [];
              event.currentTarget.value = "";
              void handleQuickThumbnailFile(file ?? null);
            }}
          />
        </label>
      ) : (
        <InventoryArtwork
          itemName={item.item_name}
          thumbnailUrl={item.thumbnail_url}
        />
      )}
      <div className="inventory-item-copy">
        <strong>{titleCase(item.item_name)}</strong>
        <p>{metadata.join(" · ")}</p>
        <div className="inventory-item-footer">
          {attention ? (
            <span className={`inventory-attention attention-${item.expiry_state === "expired" ? "urgent" : item.status}`}>
              {attention}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="inventory-item-row-actions">
            {item.added_at && !onAcknowledge && (
              <small className="inventory-item-added-at">
                {inventoryAddedDateLabel(item.added_at)}
              </small>
            )}
            {onAcknowledge && (
              <button
                className="inventory-acknowledge"
                type="button"
                disabled={acknowledging}
                onClick={() => void onAcknowledge()}
              >
                {acknowledging ? "Saving…" : "Acknowledge"}
              </button>
            )}
            {shoppingState && !selecting && (
              <button
                className="inventory-add-to-shopping"
                type="button"
                aria-label={
                  shoppingState === "added"
                    ? `${titleCase(item.item_name)} is on the shopping list`
                    : `Add ${titleCase(item.item_name)} to shopping list`
                }
                disabled={shoppingState !== "available"}
                onClick={() => void onAddToShopping?.()}
              >
                {shoppingState === "added" ? (
                  <>
                    <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    On List
                  </>
                ) : shoppingState === "adding" ? (
                  "Adding…"
                ) : (
                  "+ Add"
                )}
              </button>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

export type DashboardViewName = "home" | "inventory" | "shopping" | "search";

export function DashboardView({ view }: { view: DashboardViewName }) {
  const searchParams = useSearchParams();
  const inventoryNavigation = useMemo(
    () => parseInventoryNavigation(searchParams),
    [searchParams],
  );
  const {
    dashboard,
    setDashboard,
    fridgeSetupStatus,
    setFridgeSetupStatus,
    loading,
    loadError,
    acknowledgedAttentionItems,
    acknowledgeAttentionItem,
    clearAttentionAcknowledgement,
    refresh,
  } = useKitchenData();
  const [command, setCommand] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [interpretation, setInterpretation] =
    useState<LoggedInterpretation | null>(null);
  const [edited, setEdited] = useState<EditableInterpretation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const error = localError ?? loadError;
  const [notice, setNotice] = useState<string | null>(null);
  const [homeQuickUpdateOpen, setHomeQuickUpdateOpen] = useState(false);
  const [fridgeSetupOpen, setFridgeSetupOpen] = useState(false);
  const [inventoryFilter, setInventoryFilter] =
    useState<InventoryCategory>("All");
  const [inventoryScope, setInventoryScope] = useState<InventoryScope>(
    () => view === "inventory" ? inventoryNavigation.scope : "all",
  );
  const [editingInventory, setEditingInventory] = useState(false);
  const [selectedInventoryItemName, setSelectedInventoryItemName] =
    useState<string | null>(null);
  const [outOfStockOpen, setOutOfStockOpen] = useState(
    () =>
      view === "inventory" &&
      (inventoryNavigation.scope === "out" ||
        inventoryNavigation.scope === "restock"),
  );
  const [selectedInventoryItems, setSelectedInventoryItems] = useState<Set<string>>(
    () => new Set(),
  );
  const [inventorySaving, setInventorySaving] = useState<string | null>(null);
  const [shoppingSaving, setShoppingSaving] = useState<string | null>(null);
  const [acknowledgingItem, setAcknowledgingItem] =
    useState<string | null>(null);
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
    () =>
      dashboard.inventory.filter(
        (item) =>
          attentionLabel(item) !== null &&
          !acknowledgedAttentionItems.has(item.item_name),
      ),
    [acknowledgedAttentionItems, dashboard.inventory],
  );

  const scopedInventoryItems = useMemo(
    () =>
      dashboard.inventory.filter(
        (item) =>
          matchesInventoryScope(item, inventoryScope) &&
          (!inventoryNavigation.item ||
            item.item_name === inventoryNavigation.item),
      ),
    [dashboard.inventory, inventoryNavigation.item, inventoryScope],
  );
  const inventoryGroups = useMemo(() => {
    const groups = new Map<ItemCategory, InventoryItem[]>();
    for (const item of scopedInventoryItems) {
      const category = resolvedInventoryCategory(item);
      if (inventoryFilter !== "All" && category !== inventoryFilter) continue;
      if (item.status === "out" || item.quantity <= 0) continue;
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    return inventoryCategories
      .filter((category): category is ItemCategory => category !== "All")
      .map((category) => ({ category, items: groups.get(category) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [inventoryFilter, scopedInventoryItems]);
  const outOfStockItems = useMemo(
    () =>
      scopedInventoryItems.filter((item) => {
        if (item.status !== "out" && item.quantity > 0) return false;
        return (
          inventoryFilter === "All" ||
          resolvedInventoryCategory(item) === inventoryFilter
        );
      }),
    [inventoryFilter, scopedInventoryItems],
  );
  const linkedInventoryItemIsOut = dashboard.inventory.some(
    (item) =>
      item.item_name === inventoryNavigation.item &&
      (item.status === "out" || item.quantity <= 0),
  );
  const outOfStockForcedOpen =
    inventoryScope === "out" ||
    inventoryScope === "restock" ||
    linkedInventoryItemIsOut;
  const showOutOfStock = outOfStockOpen || outOfStockForcedOpen;
  const activeShoppingItems = dashboard.shoppingList.filter(
    (item) => item.status === "active",
  );
  const purchasedShoppingItems = dashboard.shoppingList.filter(
    (item) => item.status === "purchased",
  );
  const shoppingItemNames = new Set(
    dashboard.shoppingList.map((item) => item.item_name),
  );
  const activeShoppingItemNames = new Set(
    dashboard.shoppingList
      .filter((item) => item.status === "active")
      .map((item) => item.item_name),
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
        href: inventoryHref({ scope: "expiring" }),
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
        href: inventoryHref({ scope: "restock" }),
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
  const homeToday = useMemo(() => {
    const items = attentionItems
      .flatMap((item) => {
        if (
          item.expiry_state === "expired" ||
          item.expiry_state === "expiring_soon"
        ) {
          return [{
            id: `expiry-${item.item_name}`,
            title: titleCase(item.item_name),
            detail: expiryLabel(item) ?? "Expiry needs attention",
            tone: item.expiry_state === "expired" ? "urgent" : "warning",
            priority: item.expiry_state === "expired" ? 0 : 1,
            href: inventoryHref({
              scope: "expiring",
              item: item.item_name,
            }),
          }];
        }
        if (item.status === "out" || item.status === "low") {
          return [{
            id: `stock-${item.item_name}`,
            title: titleCase(item.item_name),
            detail: item.status === "out"
              ? "Out of stock"
              : `Low · ${quantityLabel(item)} left`,
            tone: item.status,
            priority: item.status === "out" ? 2 : 3,
            href: inventoryHref({
              scope: item.status === "out" ? "out" : "low",
              item: item.item_name,
            }),
          }];
        }
        return [];
      })
      .sort((left, right) => left.priority - right.priority);

    if (activeShoppingItems.length > 0) {
      items.push({
        id: "shopping",
        title: "Shopping List",
        detail: `${activeShoppingItems.length} item${
          activeShoppingItems.length === 1 ? "" : "s"
        } to buy`,
        tone: "shopping",
        priority: 4,
        href: "/shopping",
      });
    }
    return items.slice(0, 3);
  }, [activeShoppingItems.length, attentionItems]);
  const homeRestockSuggestions = useMemo(
    () =>
      dashboard.inventory
        .filter(
          (item) =>
            (item.status === "low" || item.status === "out") &&
            !shoppingItemNames.has(item.item_name),
        )
        .slice(0, 2),
    [dashboard.inventory, dashboard.shoppingList],
  );
  const homeThresholdSuggestion = useMemo(
    () =>
      dashboard.inventory.find(
        (item) => item.low_threshold === null && item.quantity > 0,
      ) ?? null,
    [dashboard.inventory],
  );
  const homeWasteItems = useMemo(
    () =>
      dashboard.inventory
        .filter(
          (item) =>
            item.nearest_expiration_date !== null && item.quantity > 0,
        )
        .sort((left, right) =>
          (left.nearest_expiration_date ?? "").localeCompare(
            right.nearest_expiration_date ?? "",
          ),
        )
        .slice(0, 3),
    [dashboard.inventory],
  );
  const homeOldItems = useMemo(
    () =>
      dashboard.inventory
        .filter(
          (item) =>
            item.quantity > 0 &&
            item.status !== "out" &&
            item.added_at !== null &&
            inventoryAgeDays(item.added_at) >= oldInventoryThresholdDays,
        )
        .sort((left, right) => {
          const leftAge = inventoryAgeDays(left.added_at ?? "");
          const rightAge = inventoryAgeDays(right.added_at ?? "");
          if (leftAge !== rightAge) return rightAge - leftAge;
          return left.item_name.localeCompare(right.item_name);
        })
        .slice(0, 3),
    [dashboard.inventory],
  );
  const homeLeftoverItems = useMemo(
    () =>
      dashboard.inventory
        .filter(
          (item) =>
            resolvedInventoryCategory(item) === "Leftovers" &&
            item.quantity > 0 &&
            item.expiry_state !== "expired",
        )
        .sort((left, right) => {
          if (left.expiry_state !== right.expiry_state) {
            if (left.expiry_state === "expiring_soon") return -1;
            if (right.expiry_state === "expiring_soon") return 1;
          }
          if (left.nearest_expiration_date && right.nearest_expiration_date) {
            return left.nearest_expiration_date.localeCompare(
              right.nearest_expiration_date,
            );
          }
          if (left.nearest_expiration_date) return -1;
          if (right.nearest_expiration_date) return 1;
          return left.item_name.localeCompare(right.item_name);
        })
        .slice(0, 6),
    [dashboard.inventory],
  );
  const homeSnapshot = useMemo(
    () => ({
      total: dashboard.inventory.length,
      low: dashboard.inventory.filter((item) => item.status === "low").length,
      out: dashboard.inventory.filter((item) => item.status === "out").length,
      expiring: dashboard.inventory.filter(
        (item) =>
          item.expiry_state === "expired" ||
          item.expiry_state === "expiring_soon",
      ).length,
    }),
    [dashboard.inventory],
  );
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
    setError(null);
    try {
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load kitchen data.",
      );
    }
  }

  useEffect(() => {
    if (view !== "home" || !homeQuickUpdateOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const input = commandInputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
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

  useLayoutEffect(() => {
    if (view !== "inventory") return;
    setInventoryScope(inventoryNavigation.scope);
    setInventoryFilter("All");
    setSelectedInventoryItemName(null);
    if (
      inventoryNavigation.scope === "out" ||
      inventoryNavigation.scope === "restock"
    ) {
      setOutOfStockOpen(true);
    }
  }, [
    inventoryNavigation.item,
    inventoryNavigation.scope,
    view,
  ]);

  useLayoutEffect(() => {
    if (
      view !== "inventory" ||
      loading ||
      !inventoryNavigation.item
    ) {
      return;
    }
    const target = document.getElementById(
      inventoryItemElementId(inventoryNavigation.item),
    );
    if (!target) return;

    target.scrollIntoView({ behavior: "auto", block: "center" });
    target.focus({ preventScroll: true });
  }, [
    inventoryFilter,
    inventoryNavigation.item,
    loading,
    outOfStockItems.length,
    view,
  ]);

  async function handleSaveInventoryItem(
    itemName: string,
    update: Parameters<typeof updateInventoryItem>[1],
  ) {
    const currentItem = dashboard.inventory.find((item) => item.item_name === itemName);
    if (currentItem && !hasInventoryItemChanges(currentItem, update)) {
      setError(null);
      setSelectedInventoryItemName(null);
      return;
    }

    setInventorySaving(itemName);
    setError(null);
    try {
      const event = await updateInventoryItem(itemName, update);
      const inventory = await getInventoryData();
      const updatedItem = inventory.find((item) => item.item_name === itemName);
      setDashboard((current) => ({
        ...current,
        events: [event, ...current.events],
        inventory: updatedItem
          ? current.inventory.map((item) =>
              item.item_name === itemName ? updatedItem : item,
            )
          : current.inventory.filter((item) => item.item_name !== itemName),
      }));
      clearAttentionAcknowledgement(itemName);
      setSelectedInventoryItemName(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update item.");
    } finally {
      setInventorySaving(null);
    }
  }

  function applyItemThumbnail(
    current: {
      inventory: InventoryItem[];
      shoppingList: ShoppingListItem[];
      events: EventRecord[];
    },
    itemName: string,
    thumbnailUrl: string | null,
  ) {
    return {
      ...current,
      inventory: current.inventory.map((item) =>
        item.item_name === itemName
          ? { ...item, thumbnail_url: thumbnailUrl }
          : item,
      ),
      shoppingList: current.shoppingList.map((item) =>
        item.item_name === itemName
          ? { ...item, thumbnail_url: thumbnailUrl }
          : item,
      ),
    };
  }

  async function handleReplaceInventoryThumbnail(
    itemName: string,
    thumbnailUrl: string,
  ) {
    setInventorySaving(itemName);
    setError(null);
    try {
      const uploaded = await uploadItemThumbnail(itemName, thumbnailUrl);
      setDashboard((current) =>
        applyItemThumbnail(current, itemName, uploaded.thumbnail_url),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update the item photo.",
      );
      throw caught;
    } finally {
      setInventorySaving(null);
    }
  }

  async function handleRemoveInventoryThumbnail(itemName: string) {
    setInventorySaving(itemName);
    setError(null);
    try {
      await removeItemThumbnail(itemName);
      setDashboard((current) => applyItemThumbnail(current, itemName, null));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove the item photo.",
      );
      throw caught;
    } finally {
      setInventorySaving(null);
    }
  }

  async function handleRemoveSelectedInventoryItems() {
    const itemNames = [...selectedInventoryItems];
    if (itemNames.length === 0) return;
    if (
      !window.confirm(
        `Delete ${itemNames.length} selected item${itemNames.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }

    setInventorySaving("__selection__");
    setError(null);
    try {
      await Promise.all(
        itemNames.map((itemName) => removeInventoryItem(itemName)),
      );
      await loadDashboard();
      for (const itemName of itemNames) {
        clearAttentionAcknowledgement(itemName);
      }
      setSelectedInventoryItems(new Set());
      setEditingInventory(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove selected items.");
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
      clearAttentionAcknowledgement(itemName);
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
        events: [result.event, ...current.events],
        inventory: result.inventory,
        shoppingList: result.items,
      }));
      clearAttentionAcknowledgement(itemName);
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
        events: [result.event, ...current.events],
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

  async function handleAcknowledgeAttention(itemName: string) {
    setAcknowledgingItem(itemName);
    setError(null);
    try {
      await acknowledgeAttentionItem(itemName);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not acknowledge this item.",
      );
    } finally {
      setAcknowledgingItem(null);
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
      const event = await addShoppingItem(item.item_name, {
        quantity: 1,
        unit: item.unit,
        location: item.location,
        expiration_date: null,
      });
      const shoppingList = await getShoppingListData();
      setDashboard((current) => ({
        ...current,
        events: [event, ...current.events],
        shoppingList,
      }));
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
      const event = await addShoppingItem(itemName, {
        quantity,
        unit: shoppingUnitDraft.trim() || null,
        location: shoppingLocationDraft || null,
        expiration_date: shoppingExpiryDraft || null,
      });
      const shoppingList = await getShoppingListData();
      setDashboard((current) => ({
        ...current,
        events: [event, ...current.events],
        shoppingList,
      }));
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
            <AccountButton />
          </header>

          {error && !homeQuickUpdateOpen && (
            <p className="message error home-message">{error}</p>
          )}

          {!loading && fridgeSetupStatus?.completed === false && (
            <button
              className="home-setup-hero"
              type="button"
              aria-labelledby="home-setup-title"
              onClick={() => setFridgeSetupOpen(true)}
            >
              <span className="home-setup-icon" aria-hidden="true">
                <PackageOpen size={28} strokeWidth={1.8} />
              </span>
              <div>
                <small>START WITH A SNAPSHOT</small>
                <h2 id="home-setup-title">Set Up My Fridge</h2>
                <p>Add what you currently have in one guided setup.</p>
              </div>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          )}

          <FridgeSetupDialog
            open={fridgeSetupOpen}
            inventory={dashboard.inventory}
            onClose={() => setFridgeSetupOpen(false)}
            onNotice={setNotice}
            onComplete={(result) => {
              setFridgeSetupStatus({
                completed: result.completed,
                completed_at: result.completed_at,
              });
              setDashboard((current) => ({
                ...current,
                inventory: result.inventory,
                events: [...result.events].reverse().concat(current.events),
              }));
            }}
          />

          <section className="home-section" aria-labelledby="today-heading">
            <div className="home-section-heading">
              <h2 id="today-heading">Today</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="rows"
                rows={3}
                label="Loading today's priorities"
              />
            ) : homeToday.length === 0 ? (
              <p className="home-empty">Nothing needs immediate attention.</p>
            ) : (
              <div className="home-priority-list">
                {homeToday.map((item) => (
                  <RouteTransitionLink href={item.href} key={item.id}>
                    <span
                      className={`home-priority-indicator tone-${item.tone}`}
                      aria-hidden="true"
                    />
                    <span className="home-row-copy">
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </RouteTransitionLink>
                ))}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="leftovers-heading">
            <div className="home-section-heading">
              <h2 id="leftovers-heading">Leftovers First</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="cards"
                rows={2}
                label="Loading leftovers"
              />
            ) : homeLeftoverItems.length === 0 ? (
              <p className="home-empty">
                Mark prepared meals as Leftovers to prioritize them here.
              </p>
            ) : (
              <div className="home-leftover-scroll">
                {homeLeftoverItems.map((item) => {
                  const amount = Math.min(1, item.quantity);
                  const consumeCommand = `I ate ${amount}${
                    item.unit ? ` ${item.unit} of` : ""
                  } ${titleCase(item.item_name)}`;
                  return (
                    <button
                      className="home-leftover-card"
                      type="button"
                      key={item.item_name}
                      aria-label={`Log ${titleCase(item.item_name)} as consumed`}
                      onClick={() => {
                        setCommand(consumeCommand);
                        setExpiryDate("");
                        setInterpretation(null);
                        setEdited(null);
                        setNotice(
                          "Review the consumed quantity, then interpret and confirm the update.",
                        );
                        setHomeQuickUpdateOpen(true);
                      }}
                    >
                      <HomeArtwork
                        itemName={item.item_name}
                        thumbnailUrl={item.thumbnail_url}
                        category="Leftovers"
                      />
                      <strong>{titleCase(item.item_name)}</strong>
                      <p>
                        {expiryLabel(item) ?? "No expiry date"} ·{" "}
                        {quantityLabel(item)}
                      </p>
                      <span>Log Used</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="briefing-heading">
            <div className="home-section-heading">
              <h2 id="briefing-heading">Kitchen Briefing</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="cards"
                rows={2}
                label="Loading kitchen status"
              />
            ) : (
              <div className="home-feature-scroll">
                {homeBriefing.map((briefing) => (
                  <RouteTransitionLink
                    className={`home-feature-card tone-${briefing.tone}`}
                    href={briefing.href}
                    key={briefing.eyebrow}
                  >
                    <span>{briefing.eyebrow}</span>
                    <strong>{briefing.title}</strong>
                    <p>{briefing.detail}</p>
                  </RouteTransitionLink>
                ))}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="suggested-heading">
            <div className="home-section-heading">
              <h2 id="suggested-heading">Suggested Actions</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="rows"
                rows={2}
                label="Loading suggested actions"
              />
            ) : homeRestockSuggestions.length === 0 &&
              homeThresholdSuggestion === null ? (
              <p className="home-empty">No actions to suggest right now.</p>
            ) : (
              <div className="home-suggestion-list">
                {homeRestockSuggestions.map((item) => (
                  <article key={`restock-${item.item_name}`}>
                    <span className="home-suggestion-icon" aria-hidden="true">
                      <PackageOpen size={20} />
                    </span>
                    <span className="home-row-copy">
                      <strong>Add {titleCase(item.item_name)} to Shopping</strong>
                      <small>{shoppingInventoryStatusLabel(item)}</small>
                    </span>
                    <button
                      type="button"
                      disabled={shoppingSaving === item.item_name}
                      onClick={() => void handleAddRecommendation(item)}
                    >
                      {shoppingSaving === item.item_name ? "Adding…" : "Add"}
                    </button>
                  </article>
                ))}
                {homeThresholdSuggestion && (
                  <article>
                    <span className="home-suggestion-icon" aria-hidden="true">
                      <Lightbulb size={20} />
                    </span>
                    <span className="home-row-copy">
                      <strong>
                        Set a low level for{" "}
                        {titleCase(homeThresholdSuggestion.item_name)}
                      </strong>
                      <small>Get a restock suggestion before it runs out.</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCommand(
                          `Set low threshold for ${titleCase(
                            homeThresholdSuggestion.item_name,
                          )} to `,
                        );
                        setExpiryDate("");
                        setInterpretation(null);
                        setEdited(null);
                        setNotice(
                          "Enter the quantity at the end, then review the interpretation.",
                        );
                        setHomeQuickUpdateOpen(true);
                      }}
                    >
                      Choose
                    </button>
                  </article>
                )}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="snapshot-heading">
            <div className="home-section-heading">
              <h2 id="snapshot-heading">Inventory Snapshot</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="metrics"
                rows={4}
                label="Loading inventory status"
              />
            ) : (
              <div className="home-snapshot">
                <RouteTransitionLink
                  href={inventoryHref()}
                  aria-label={`View all ${homeSnapshot.total} tracked inventory items`}
                >
                  <strong>{homeSnapshot.total}</strong>
                  <small>Tracked</small>
                </RouteTransitionLink>
                <RouteTransitionLink
                  href={inventoryHref({ scope: "low" })}
                  aria-label={`View ${homeSnapshot.low} low inventory items`}
                >
                  <strong>{homeSnapshot.low}</strong>
                  <small>Low</small>
                </RouteTransitionLink>
                <RouteTransitionLink
                  href={inventoryHref({ scope: "out" })}
                  aria-label={`View ${homeSnapshot.out} out-of-stock inventory items`}
                >
                  <strong>{homeSnapshot.out}</strong>
                  <small>Out</small>
                </RouteTransitionLink>
                <RouteTransitionLink
                  href={inventoryHref({ scope: "expiring" })}
                  aria-label={`View ${homeSnapshot.expiring} expiring inventory items`}
                >
                  <strong>{homeSnapshot.expiring}</strong>
                  <small>Expiring</small>
                </RouteTransitionLink>
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="waste-heading">
            <div className="home-section-heading">
              <h2 id="waste-heading">Waste Prevention</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="rows"
                rows={2}
                label="Loading dated inventory"
              />
            ) : homeWasteItems.length === 0 ? (
              <p className="home-empty">
                Add expiry dates to see what should be used first.
              </p>
            ) : (
              <div className="home-waste-list">
                {homeWasteItems.map((item) => (
                  <RouteTransitionLink
                    href={inventoryHref({
                      scope: "expiring",
                      item: item.item_name,
                    })}
                    key={item.item_name}
                  >
                    <HomeArtwork
                      itemName={item.item_name}
                      thumbnailUrl={item.thumbnail_url}
                    />
                    <span className="home-row-copy">
                      <strong>{titleCase(item.item_name)}</strong>
                      <small>
                        {expiryLabel(item)} · {quantityLabel(item)}
                      </small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </RouteTransitionLink>
                ))}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="older-stock-heading">
            <div className="home-section-heading">
              <h2 id="older-stock-heading">Older Stock</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="rows"
                rows={2}
                label="Loading older inventory"
              />
            ) : homeOldItems.length === 0 ? (
              <p className="home-empty">
                Items that have been here for more than two weeks will appear here.
              </p>
            ) : (
              <div className="home-waste-list">
                {homeOldItems.map((item) => (
                  <RouteTransitionLink
                    href={inventoryHref({
                      item: item.item_name,
                    })}
                    key={item.item_name}
                  >
                    <HomeArtwork
                      itemName={item.item_name}
                      thumbnailUrl={item.thumbnail_url}
                    />
                    <span className="home-row-copy">
                      <strong>{titleCase(item.item_name)}</strong>
                      <small>
                        {item.added_at ? oldInventoryLabel(item.added_at) : "Added date unavailable"} · {quantityLabel(item)}
                      </small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </RouteTransitionLink>
                ))}
              </div>
            )}
          </section>

          <section className="home-section" aria-labelledby="recent-heading">
            <div className="home-section-heading">
              <h2 id="recent-heading">Recently Updated</h2>
            </div>
            {loading ? (
              <LoadingSkeleton
                variant="cards"
                rows={2}
                label="Loading recent updates"
              />
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
                setEditingInventory((current) => {
                  if (current) setSelectedInventoryItems(new Set());
                  return !current;
                });
                setSelectedInventoryItemName(null);
              }}
            >
              {editingInventory ? "Done" : "Edit"}
            </button>
          </div>

          {error && <p className="message error inventory-message">{error}</p>}

          {editingInventory && dashboard.inventory.length > 0 && (
            <div className="inventory-selection-bar">
              <span aria-live="polite">{selectedInventoryItems.size} Selected</span>
              <button
                type="button"
                aria-label={`Delete ${selectedInventoryItems.size} selected item${selectedInventoryItems.size === 1 ? "" : "s"}`}
                disabled={selectedInventoryItems.size === 0 || inventorySaving !== null}
                onClick={() => void handleRemoveSelectedInventoryItems()}
              >
                {inventorySaving === "__selection__" ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}

          {loading ? (
            <LoadingSkeleton
              variant="rows"
              rows={6}
              label="Loading inventory"
            />
          ) : dashboard.inventory.length === 0 ? (
            <p className="empty-state inventory-empty">No inventory actions yet.</p>
          ) : (
            <div className="inventory-library">
              {attentionItems.length > 0 &&
                !editingInventory &&
                !inventoryNavigation.item && (
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
                        acknowledging={acknowledgingItem === item.item_name}
                        onAcknowledge={() =>
                          handleAcknowledgeAttention(item.item_name)
                        }
                        onReplaceThumbnail={(thumbnailUrl) =>
                          handleReplaceInventoryThumbnail(
                            item.item_name,
                            thumbnailUrl,
                          )
                        }
                        onRemoveThumbnail={() =>
                          handleRemoveInventoryThumbnail(item.item_name)
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              <div
                className="inventory-filters inventory-category-filters"
                role="group"
                aria-label="Filter inventory by category"
              >
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
                {inventoryGroups.length === 0 &&
                outOfStockItems.length === 0 ? (
                  <p className="empty-state inventory-empty">
                    No items match these filters.
                  </p>
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
                            !editingInventory &&
                            selectedInventoryItemName === item.item_name
                          }
                          selecting={editingInventory}
                          selected={selectedInventoryItems.has(item.item_name)}
                          busy={inventorySaving === item.item_name}
                          onOpen={() =>
                            setSelectedInventoryItemName((current) =>
                              current === item.item_name ? null : item.item_name,
                            )
                          }
                          onSelect={() =>
                            setSelectedInventoryItems((current) => {
                              const next = new Set(current);
                              if (next.has(item.item_name)) {
                                next.delete(item.item_name);
                              } else {
                                next.add(item.item_name);
                              }
                              return next;
                            })
                          }
                          onCancel={() => setSelectedInventoryItemName(null)}
                          onSave={(update) =>
                            handleSaveInventoryItem(item.item_name, update)
                          }
                          onReplaceThumbnail={(thumbnailUrl) =>
                            handleReplaceInventoryThumbnail(
                              item.item_name,
                              thumbnailUrl,
                            )
                          }
                          onRemoveThumbnail={() =>
                            handleRemoveInventoryThumbnail(item.item_name)
                          }
                          onRemove={() => handleRemoveInventoryItem(item.item_name)}
                          domId={inventoryItemElementId(item.item_name)}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                {outOfStockItems.length > 0 && (
                  <details
                    className="inventory-out-of-stock"
                    open={showOutOfStock}
                    onToggle={(event) => {
                      if (!outOfStockForcedOpen) {
                        setOutOfStockOpen(event.currentTarget.open);
                      }
                    }}
                  >
                    <summary
                      className="inventory-section-heading"
                      onClick={(event) => {
                        if (outOfStockForcedOpen) event.preventDefault();
                      }}
                    >
                      <h3>Out of Stock</h3>
                      <span>
                        <b>{outOfStockItems.length}</b>
                        <ChevronDown size={18} aria-hidden="true" />
                      </span>
                    </summary>
                    <div className="inventory-list">
                      {outOfStockItems.map((item) => (
                        <InventoryItemRow
                          item={item}
                          key={`out-${item.item_name}`}
                          editing={
                            !editingInventory &&
                            selectedInventoryItemName === item.item_name
                          }
                          selecting={editingInventory}
                          selected={selectedInventoryItems.has(item.item_name)}
                          busy={inventorySaving === item.item_name}
                          onOpen={() =>
                            setSelectedInventoryItemName((current) =>
                              current === item.item_name ? null : item.item_name,
                            )
                          }
                          onSelect={() =>
                            setSelectedInventoryItems((current) => {
                              const next = new Set(current);
                              if (next.has(item.item_name)) {
                                next.delete(item.item_name);
                              } else {
                                next.add(item.item_name);
                              }
                              return next;
                            })
                          }
                          onCancel={() => setSelectedInventoryItemName(null)}
                          onSave={(update) =>
                            handleSaveInventoryItem(item.item_name, update)
                          }
                          onReplaceThumbnail={(thumbnailUrl) =>
                            handleReplaceInventoryThumbnail(
                              item.item_name,
                              thumbnailUrl,
                            )
                          }
                          onRemoveThumbnail={() =>
                            handleRemoveInventoryThumbnail(item.item_name)
                          }
                          onRemove={() =>
                            handleRemoveInventoryItem(item.item_name)
                          }
                          shoppingState={
                            activeShoppingItemNames.has(item.item_name)
                              ? "added"
                              : shoppingSaving === item.item_name
                                ? "adding"
                                : "available"
                          }
                          onAddToShopping={() =>
                            handleAddRecommendation(item)
                          }
                          domId={inventoryItemElementId(item.item_name)}
                        />
                      ))}
                    </div>
                  </details>
                )}
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
            <LoadingSkeleton
              variant="rows"
              rows={6}
              label="Loading shopping list"
            />
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
                        <ShoppingArtwork
                          itemName={item.item_name}
                          thumbnailUrl={item.thumbnail_url}
                        />
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
                        thumbnailUrl={item.thumbnail_url}
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
                        thumbnailUrl={item.thumbnail_url}
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
