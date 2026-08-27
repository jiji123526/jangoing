"use client";

import type {
  CreateEventRequest,
  EventType,
  Intent,
  LoggedInterpretation,
} from "@jangoing/contracts";
import {
  CalendarDays,
  Check,
  History,
  LoaderCircle,
  RefreshCw,
  Refrigerator,
  Send,
  ShoppingBasket,
  Tags,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  createEvent,
  getDashboardData,
  interpretCommand,
  updateInferenceOutcome,
  type DashboardData,
} from "../lib/api";

const eventTypeByIntent: Partial<Record<Intent, EventType>> = {
  add_item: "item_added",
  consume_item: "item_consumed",
  mark_low: "item_marked_low",
  throw_away: "item_thrown_away",
  add_to_buy: "item_added_to_buy",
};

const examples = [
  "Add two cartons of milk",
  "We are low on eggs",
  "Put yogurt on the shopping list",
];

const editableIntents: Intent[] = [
  "add_item",
  "consume_item",
  "mark_low",
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

export default function Home() {
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

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await getDashboardData());
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
  }, []);

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
    <main>
      <header className="topbar">
        <div>
          <span className="brand">jangoing</span>
          <span className="phase">Text MVP</span>
        </div>
        <div className="top-actions">
          <Link className="annotation-link" href="/annotate">
            <Tags size={16} /> Annotate
          </Link>
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            title="Refresh kitchen data"
            aria-label="Refresh kitchen data"
          >
            <RefreshCw size={18} className={loading ? "spin" : undefined} />
          </button>
        </div>
      </header>

      <section className="command-band" aria-labelledby="command-heading">
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

      <div className="dashboard-grid">
        <section className="data-section inventory-section">
          <div className="data-heading">
            <div>
              <Refrigerator size={19} />
              <h2>Inventory</h2>
            </div>
            <span>{dashboard.inventory.length}</span>
          </div>

          {loading ? (
            <p className="empty-state">Loading inventory...</p>
          ) : dashboard.inventory.length === 0 ? (
            <p className="empty-state">No inventory actions yet.</p>
          ) : (
            <div className="inventory-list">
              {dashboard.inventory.map((item) => (
                <div className="inventory-row" key={item.item_name}>
                  <div>
                    <strong>{titleCase(item.item_name)}</strong>
                    <span>
                      {item.quantity > 0
                        ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                        : "Quantity not recorded"}
                    </span>
                  </div>
                  <div className="inventory-meta">
                    <span className={`status status-${item.status}`}>
                      {titleCase(item.status)}
                    </span>
                    {item.nearest_expiration_date && (
                      <time
                        className={`expiry expiry-${item.expiry_state}`}
                        dateTime={item.nearest_expiration_date}
                      >
                        {item.nearest_expiration_date}
                      </time>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="data-section shopping-section">
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
      </div>
    </main>
  );
}
