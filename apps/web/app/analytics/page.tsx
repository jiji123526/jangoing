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

export default function AnalyticsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        label: "Updates",
        value: weeklyEvents.length,
        icon: BarChart3,
        tone: "updates",
      },
      {
        label: "Added",
        value: countEvents(weeklyEvents, ["item_added"]),
        icon: PackagePlus,
        tone: "added",
      },
      {
        label: "Purchased",
        value: countEvents(weeklyEvents, ["shopping_item_purchased"]),
        icon: ShoppingBag,
        tone: "purchased",
      },
      {
        label: "Discarded",
        value: countEvents(weeklyEvents, ["item_thrown_away"]),
        icon: Trash2,
        tone: "discarded",
      },
    ],
    [weeklyEvents],
  );

  const activeItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of weeklyEvents) {
      counts.set(event.item_name, (counts.get(event.item_name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5);
  }, [weeklyEvents]);

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
            {metrics.map(({ label, value, icon: Icon, tone }) => (
              <article className={`analytics-metric tone-${tone}`} key={label}>
                <Icon size={20} aria-hidden="true" />
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="analytics-section" aria-labelledby="active-heading">
        <div className="analytics-section-heading">
          <div>
            <h2 id="active-heading">Most Active Items</h2>
            <p>Items with the most recorded changes this week</p>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton
            variant="rows"
            rows={4}
            label="Loading active items"
          />
        ) : activeItems.length === 0 ? (
          <p className="analytics-empty">
            Weekly item activity will appear after actions are recorded.
          </p>
        ) : (
          <ol className="analytics-item-list">
            {activeItems.map(([itemName, count], index) => (
              <li key={itemName}>
                <span>{index + 1}</span>
                <strong>{titleCase(itemName)}</strong>
                <small>
                  {count} update{count === 1 ? "" : "s"}
                </small>
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
