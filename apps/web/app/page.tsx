"use client";

import type {
  CreateEventRequest,
  EventType,
  Intent,
  InventoryItem,
  LoggedInterpretation,
} from "@jangoing/contracts";
import {
  CalendarDays,
  Check,
  History,
  LoaderCircle,
  Send,
  ShoppingBasket,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createEvent,
  getDashboardData,
  getInventoryData,
  getShoppingListData,
  interpretCommand,
  removeInventoryItem,
  updateInventoryItem,
  updateInferenceOutcome,
  type DashboardData,
} from "../lib/api";

const eventTypeByIntent: Partial<Record<Intent, EventType>> = {
  add_item: "item_added",
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
  unit: string;
  location: "" | "fridge" | "freezer" | "pantry";
  expirationDate: string;
};

function toEditable(interpretation: LoggedInterpretation): EditableInterpretation {
  return {
    intent: interpretation.intent,
    itemName: interpretation.slots.item_name ?? "",
    quantity: interpretation.slots.quantity?.toString() ?? "",
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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
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
  if (item.quantity <= 0) return "Quantity not recorded";
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
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const category = inventoryCategory(item.item_name);
  const attention = attentionLabel(item);
  const [quantity, setQuantity] = useState(String(item.quantity || 1));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [location, setLocation] = useState(item.location ?? "");
  const [expirationDate, setExpirationDate] = useState(
    item.nearest_expiration_date ?? "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const metadata = [
    quantityLabel(item),
    item.location ? titleCase(item.location) : null,
    attention ? null : expiryLabel(item),
  ].filter((value): value is string => Boolean(value));

  if (editing) {
    const hasCustomUnit =
      unit && !(inventoryUnitOptions as readonly string[]).includes(unit);

    function adjustQuantity(delta: number) {
      const current = Number(quantity);
      const baseline = Number.isFinite(current) ? current : 1;
      const next = Math.max(0.01, baseline + delta);
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
            if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
              setValidationError("Quantity must be greater than zero.");
              return;
            }
            setValidationError(null);
            void onSave?.({
              quantity: parsedQuantity,
              unit: unit.trim() || null,
              location: location as InventoryItem["location"],
              expiration_date: expirationDate || null,
            });
          }}
        >
          <div className="inventory-edit-header">
            <strong>{titleCase(item.item_name)}</strong>
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
                  min="0.01"
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

          <button
            className="inventory-remove-button"
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove ${titleCase(item.item_name)} from inventory?`)) {
                void onRemove?.();
              }
            }}
          >
            Remove from Inventory
          </button>
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
  const [inventoryFilter, setInventoryFilter] =
    useState<InventoryCategory>("All");
  const [editingInventory, setEditingInventory] = useState(false);
  const [selectedInventoryItemName, setSelectedInventoryItemName] =
    useState<string | null>(null);
  const [inventorySaving, setInventorySaving] = useState<string | null>(null);

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
  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      if (view === "inventory" || view === "search") {
        const inventory = await getInventoryData();
        setDashboard({ ...emptyDashboard, inventory });
      } else if (view === "shopping") {
        const shoppingList = await getShoppingListData();
        setDashboard({ ...emptyDashboard, shoppingList });
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
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setError("Quantity must be a number greater than zero.");
      return;
    }

    const payload: CreateEventRequest = {
      event_type: eventType,
      item_name: edited.itemName.trim().toLowerCase(),
      quantity,
      unit: edited.unit.trim().toLowerCase() || null,
      location: edited.location || null,
      expiration_date: edited.expirationDate || null,
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
        parser_version: "rules-v1",
      });
      setCommand("");
      setExpiryDate("");
      setInterpretation(null);
      setEdited(null);
      setNotice(`${titleCase(payload.item_name)} updated.`);
      await loadDashboard();
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
      (edited.itemName.trim() && eventTypeByIntent[edited.intent]));

  return (
    <main id={view}>
      {(view === "home" || view === "search") && (
      <section
        className="command-band"
        id="command"
        aria-labelledby="command-heading"
      >
        <div className="section-heading">
          <p className="eyebrow">Kitchen command</p>
          <h1 id="command-heading">What changed?</h1>
        </div>

        <form onSubmit={handleInterpret} className="command-form">
          <label className="field command-field">
            <span>English command</span>
            <div className="command-input-wrap">
              <input
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
      )}

      {view !== "search" && (
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
          <div className="data-heading">
            <div>
              <ShoppingBasket size={19} />
              <h2>Shopping list</h2>
            </div>
            <span>{dashboard.shoppingList.length}</span>
          </div>

          {dashboard.shoppingList.length === 0 ? (
            <p className="empty-state">Nothing to buy yet.</p>
          ) : (
            <ul className="shopping-list">
              {dashboard.shoppingList.map((item) => (
                <li key={item.item_name}>
                  <span className="check-box" aria-hidden="true" />
                  {titleCase(item.item_name)}
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {view === "home" && (
        <section className="data-section history-section">
          <div className="data-heading">
            <div>
              <History size={19} />
              <h2>Recent actions</h2>
            </div>
            <span>{dashboard.events.length}</span>
          </div>

          {dashboard.events.length === 0 ? (
            <p className="empty-state">Confirmed actions will appear here.</p>
          ) : (
            <ol className="event-list">
              {dashboard.events.slice(0, 10).map((event) => (
                <li key={event.id}>
                  <span className="event-marker" />
                  <div>
                    <strong>{titleCase(event.event_type)}</strong>
                    <p>{event.raw_utterance}</p>
                    <time dateTime={event.created_at}>
                      {formatTimestamp(event.created_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
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
