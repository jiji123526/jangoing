import {
  AnnotationStatsSchema,
  AnnotationQueueResponseSchema,
  EventRecordSchema,
  LoggedInterpretationSchema,
  InventoryItemSchema,
  ShoppingListItemSchema,
  type ConfirmActionRequest,
  type AnnotationQueueItem,
  type AnnotationQueueType,
  type AnnotationStats,
  type CreateAnnotationRequest,
  type EventRecord,
  type LoggedInterpretation,
  type UpdateInferenceOutcomeRequest,
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
): Promise<LoggedInterpretation> {
  const body = await apiRequest("/commands/interpret", {
    method: "POST",
    body: JSON.stringify({
      text,
      ...(expirationDate ? { expiration_date: expirationDate } : {}),
    }),
  });

  return LoggedInterpretationSchema.parse(body);
}

export async function updateInferenceOutcome(
  update: UpdateInferenceOutcomeRequest,
): Promise<void> {
  await apiRequest("/inferences/outcome", {
    method: "POST",
    body: JSON.stringify(update),
  });
}

export async function createEvent(
  submission: ConfirmActionRequest,
): Promise<EventRecord> {
  const body = await apiRequest("/events", {
    method: "POST",
    body: JSON.stringify(submission),
  });

  return EventRecordSchema.parse(body);
}

export async function createAnnotation(
  annotation: CreateAnnotationRequest,
): Promise<void> {
  await apiRequest("/annotations", {
    method: "POST",
    body: JSON.stringify(annotation),
  });
}

export async function getAnnotationStats(): Promise<AnnotationStats> {
  const body = await apiRequest("/annotations/stats");
  return AnnotationStatsSchema.parse(body);
}

export async function getAnnotationQueue(
  type: AnnotationQueueType,
  limit = 1,
): Promise<AnnotationQueueItem[]> {
  const body = await apiRequest(
    `/annotations/queue?type=${encodeURIComponent(type)}&limit=${limit}`,
  );
  return AnnotationQueueResponseSchema.parse(body).items;
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
