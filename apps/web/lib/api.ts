import {
  EventRecordSchema,
  InterpretationSchema,
  InventoryItemSchema,
  ShoppingListItemSchema,
  type CreateEventRequest,
  type EventRecord,
  type Interpretation,
  type InventoryItem,
  type ShoppingListItem,
} from "@jangoing/contracts";
import { z } from "zod";

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/$/, "");

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function interpretCommand(
  text: string,
  expirationDate?: string,
): Promise<Interpretation> {
  const body = await apiRequest("/commands/interpret", {
    method: "POST",
    body: JSON.stringify({
      text,
      ...(expirationDate ? { expiration_date: expirationDate } : {}),
    }),
  });

  return InterpretationSchema.parse(body);
}

export async function createEvent(
  event: CreateEventRequest,
): Promise<EventRecord> {
  const body = await apiRequest("/events", {
    method: "POST",
    body: JSON.stringify(event),
  });

  return EventRecordSchema.parse(body);
}

const InventoryResponseSchema = z.object({
  inventory: z.array(InventoryItemSchema),
});
const EventsResponseSchema = z.object({
  events: z.array(EventRecordSchema),
});
const ShoppingListResponseSchema = z.object({
  items: z.array(ShoppingListItemSchema),
});

export interface DashboardData {
  inventory: InventoryItem[];
  events: EventRecord[];
  shoppingList: ShoppingListItem[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const [inventoryBody, eventsBody, shoppingBody] = await Promise.all([
    apiRequest("/inventory"),
    apiRequest("/events"),
    apiRequest("/shopping-list"),
  ]);

  return {
    inventory: InventoryResponseSchema.parse(inventoryBody).inventory,
    events: EventsResponseSchema.parse(eventsBody).events,
    shoppingList: ShoppingListResponseSchema.parse(shoppingBody).items,
  };
}
