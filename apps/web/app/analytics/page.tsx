"use client";

import type { EventRecord, EventType } from "@jangoing/contracts";
import {
  BarChart3,
  PackagePlus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getEventsData } from "../../lib/api";
import { LoadingSkeleton } from "../LoadingSkeleton";

const weekInMilliseconds = 7 * 24 * 60 * 60 * 1_000;
type MetricFilter = "updates" | "added" | "purchased" | "discarded";

const metricConfig: Record<
  MetricFilter,
  {
    label: string;
    title: string;
    description: string;
    empty: string;
    tone: string;
    eventTypes: EventType[] | null;
    icon: typeof BarChart3;
  }
> = {
  updates: {
    label: "Updates",
    title: "Weekly Updates",
    description: "All recorded activity from the last 7 days",
    empty: "Weekly activity will appear after actions are recorded.",
    tone: "updates",
    eventTypes: null,
    icon: BarChart3,
  },
  added: {
    label: "Added",
    title: "Items Added",
    description: "Inventory additions recorded this week",
    empty: "Added inventory items will appear here.",
    tone: "added",
    eventTypes: ["item_added"],
    icon: PackagePlus,
  },
  purchased: {
    label: "Purchased",
    title: "Items Purchased",
    description: "Shopping items marked purchased this week",
    empty: "Purchased items will appear here.",
    tone: "purchased",
    eventTypes: ["shopping_item_purchased"],
    icon: ShoppingBag,
  },
  discarded: {
    label: "Discarded",
    title: "Items Discarded",
    description: "Inventory items thrown away this week",
    empty: "Discarded items will appear here.",
    tone: "discarded",
    eventTypes: ["item_thrown_away"],
    icon: Trash2,
  },
};

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function countEvents(events: EventRecord[], eventTypes: EventType[]): number {
  const selectedTypes = new Set<EventType>(eventTypes);
  return events.filter((event) => selectedTypes.has(event.event_type)).length;
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

function eventSummary(event: EventRecord): string {
  const quantity =
    event.quantity && event.quantity > 0
      ? ` ${event.quantity}${event.unit ? ` ${event.unit}` : ""}`
      : "";

  switch (event.event_type) {
    case "item_added":
      return `Added${quantity} · ${relativeTimestamp(event.created_at)}`;
    case "item_consumed":
      return `Used${quantity} · ${relativeTimestamp(event.created_at)}`;
    case "item_marked_low":
      return `Marked low · ${relativeTimestamp(event.created_at)}`;
    case "item_marked_out":
      return `Marked out · ${relativeTimestamp(event.created_at)}`;
    case "item_thrown_away":
      return `Discarded${quantity} · ${relativeTimestamp(event.created_at)}`;
    case "item_added_to_buy":
      return `Added to shopping · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_purchased":
      return `Purchased${quantity} · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_restored":
      return `Returned to list · ${relativeTimestamp(event.created_at)}`;
    case "shopping_item_deleted":
      return `Removed from list · ${relativeTimestamp(event.created_at)}`;
    case "item_low_threshold_set":
      return `Low level updated · ${relativeTimestamp(event.created_at)}`;
    case "item_adjusted":
      return `Inventory updated · ${relativeTimestamp(event.created_at)}`;
    case "item_removed":
      return `Removed from inventory · ${relativeTimestamp(event.created_at)}`;
  }
}

export default function AnalyticsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricFilter | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const since = new Date(Date.now() - weekInMilliseconds).toISOString();
    getEventsData(since)
      .then((result) => {
        if (active) setEvents(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load weekly activity.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const weeklyEvents = useMemo(() => {
    const cutoff = Date.now() - weekInMilliseconds;
    return events.filter(
      (event) => new Date(event.created_at).getTime() >= cutoff,
    );
  }, [events]);

  const metrics = useMemo(
    () => [
      {
        key: "updates" as const,
        label: "Updates",
        value: weeklyEvents.length,
        icon: BarChart3,
        tone: "updates",
      },
      {
        key: "added" as const,
        label: "Added",
        value: countEvents(weeklyEvents, ["item_added"]),
        icon: PackagePlus,
        tone: "added",
      },
      {
        key: "purchased" as const,
        label: "Purchased",
        value: countEvents(weeklyEvents, ["shopping_item_purchased"]),
        icon: ShoppingBag,
        tone: "purchased",
      },
      {
        key: "discarded" as const,
        label: "Discarded",
        value: countEvents(weeklyEvents, ["item_thrown_away"]),
        icon: Trash2,
        tone: "discarded",
      },
    ],
    [weeklyEvents],
  );

  const selectedMetricConfig = selectedMetric
    ? metricConfig[selectedMetric]
    : metricConfig.updates;
  const selectedEvents = useMemo(() => {
    const eventTypes = selectedMetric
      ? selectedMetricConfig.eventTypes
      : null;
    return weeklyEvents
      .filter((event) => eventTypes === null || eventTypes.includes(event.event_type))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 12);
  }, [selectedMetric, selectedMetricConfig.eventTypes, weeklyEvents]);

  return (
    <main id="analytics" className="analytics-page">
      <header className="analytics-titlebar">
        <h1>Analytics</h1>
      </header>

      <section className="analytics-section" aria-labelledby="weekly-heading">
        <div className="analytics-section-heading">
          <div>
            <h2 id="weekly-heading">This Week</h2>
            <p>Activity recorded in the last 7 days</p>
          </div>
        </div>

        {error && <p className="message error analytics-message">{error}</p>}
        {loading ? (
          <LoadingSkeleton
            variant="metrics"
            rows={4}
            label="Loading weekly activity"
          />
        ) : (
          <div className="analytics-metric-grid">
            {metrics.map(({ key, label, value, icon: Icon, tone }) => (
              <button
                className={`analytics-metric tone-${tone}${selectedMetric === key ? " is-active" : ""}`}
                type="button"
                key={label}
                aria-pressed={selectedMetric === key}
                onClick={() =>
                  setSelectedMetric((current) => (current === key ? null : key))
                }
              >
                <Icon size={20} aria-hidden="true" />
                <strong>{value}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="analytics-section" aria-labelledby="active-heading">
        <div className="analytics-section-heading">
          <div>
            <h2 id="active-heading">{selectedMetricConfig.title}</h2>
            <p>{selectedMetricConfig.description}</p>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton
            variant="rows"
            rows={4}
            label="Loading active items"
          />
        ) : selectedEvents.length === 0 ? (
          <p className="analytics-empty">{selectedMetricConfig.empty}</p>
        ) : (
          <ol className="analytics-item-list" aria-live="polite">
            {selectedEvents.map((event, index) => (
              <li key={event.id}>
                <span>{index + 1}</span>
                <strong>{titleCase(event.item_name)}</strong>
                <small>{eventSummary(event)}</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="analytics-footnote">
        This summary reflects recorded actions, not unobserved physical changes.
      </p>
    </main>
  );
}
