import {
  AnnotationAssistantProposalSchema,
  AnnotationNormalizedValuesResponseSchema,
  AnnotationStatsSchema,
  AnnotationQueueResponseSchema,
  EventRecordSchema,
  LoggedInterpretationSchema,
  InventoryItemSchema,
  ShoppingListItemSchema,
  type ConfirmActionRequest,
  type AnnotationAssistantProposal,
  type AnnotationQueueItem,
  type AnnotationQueueType,
  type AnnotationNormalizedValuesResponse,
  type AnnotationStats,
  type CreateAnnotationRequest,
  type EventRecord,
  type LoggedInterpretation,
  type UpdateInferenceOutcomeRequest,
  type InventoryItem,
  type ShoppingListItem,
  type ShoppingItemContextRequest,
  type ActivationMode,
  type AdjustInventoryItemRequest,
  type SpeakerRole,
} from "@jangoing/contracts";
import { z } from "zod";

function inferBrowserApiBaseUrl(): string {
  const { protocol, hostname, port } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8787";
  }

  if (protocol === "https:" && port === "" && hostname.includes("--3000.")) {
    return `https://${hostname.replace("--3000.", "--8787.")}`;
  }

  return "http://localhost:8787";
}

function apiBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== "undefined") {
    return inferBrowserApiBaseUrl();
  }

  return "http://localhost:8787";
}

function localReferenceDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
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
  context?: {
    conversation_id?: string;
    turn_index?: number;
    speaker_role?: SpeakerRole;
    activation_mode?: ActivationMode;
  },
): Promise<LoggedInterpretation> {
  const body = await apiRequest("/commands/interpret", {
    method: "POST",
    body: JSON.stringify({
      text,
      ...(expirationDate ? { expiration_date: expirationDate } : {}),
      reference_date: localReferenceDate(),
      timezone: localTimezone(),
      speaker_role: context?.speaker_role ?? "user",
      activation_mode: context?.activation_mode ?? "manual_text",
      ...(context?.conversation_id ? { conversation_id: context.conversation_id } : {}),
      ...(context?.turn_index !== undefined ? { turn_index: context.turn_index } : {}),
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

export async function createAnnotationAssistantProposal(
  inferenceId: string,
): Promise<AnnotationAssistantProposal> {
  const body = await apiRequest("/annotations/proposal", {
    method: "POST",
    body: JSON.stringify({
      inference_id: inferenceId,
    }),
  });

  return AnnotationAssistantProposalSchema.parse(body);
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

export async function getAnnotationNormalizedValues(): Promise<AnnotationNormalizedValuesResponse> {
  const body = await apiRequest("/annotations/normalized-values");
  return AnnotationNormalizedValuesResponseSchema.parse(body);
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
const ShoppingMutationResponseSchema = z.object({
  event: EventRecordSchema,
  inventory: z.array(InventoryItemSchema),
  items: z.array(ShoppingListItemSchema),
});

export interface DashboardData {
  inventory: InventoryItem[];
  events: EventRecord[];
  shoppingList: ShoppingListItem[];
}
export type ShoppingMutationResult = z.infer<
  typeof ShoppingMutationResponseSchema
>;

export async function getInventoryData(): Promise<InventoryItem[]> {
  const body = await apiRequest("/inventory");
  return InventoryResponseSchema.parse(body).inventory;
}

export async function updateInventoryItem(
  itemName: string,
  update: AdjustInventoryItemRequest,
): Promise<EventRecord> {
  const body = await apiRequest(
    `/inventory/${encodeURIComponent(itemName)}/edit`,
    { method: "POST", body: JSON.stringify(update) },
  );
  return EventRecordSchema.parse(body);
}

export async function removeInventoryItem(itemName: string): Promise<EventRecord> {
  const body = await apiRequest(
    `/inventory/${encodeURIComponent(itemName)}/remove`,
    { method: "POST" },
  );
  return EventRecordSchema.parse(body);
}

export async function getEventsData(): Promise<EventRecord[]> {
  const body = await apiRequest("/events");
  return EventsResponseSchema.parse(body).events;
}

export async function getShoppingListData(): Promise<ShoppingListItem[]> {
  const body = await apiRequest("/shopping-list");
  return ShoppingListResponseSchema.parse(body).items;
}

export async function markShoppingItemPurchased(
  itemName: string,
): Promise<ShoppingMutationResult> {
  const body = await apiRequest(
    `/shopping-list/${encodeURIComponent(itemName)}/purchase?include=projections`,
    { method: "POST" },
  );
  return ShoppingMutationResponseSchema.parse(body);
}

export async function addShoppingItem(
  itemName: string,
  context: ShoppingItemContextRequest = {
    quantity: 1,
    unit: null,
    location: null,
    expiration_date: null,
  },
): Promise<EventRecord> {
  const body = await apiRequest(
    `/shopping-list/${encodeURIComponent(itemName)}/add`,
    { method: "POST", body: JSON.stringify(context) },
  );
  return EventRecordSchema.parse(body);
}

export async function restoreShoppingItem(
  itemName: string,
): Promise<ShoppingMutationResult> {
  const body = await apiRequest(
    `/shopping-list/${encodeURIComponent(itemName)}/restore?include=projections`,
    { method: "POST" },
  );
  return ShoppingMutationResponseSchema.parse(body);
}

export async function deleteShoppingItem(
  itemName: string,
): Promise<ShoppingMutationResult> {
  const body = await apiRequest(
    `/shopping-list/${encodeURIComponent(itemName)}/delete?include=projections`,
    { method: "POST" },
  );
  return ShoppingMutationResponseSchema.parse(body);
}

export async function getDashboardData(): Promise<DashboardData> {
  const [inventory, events, shoppingList] = await Promise.all([
    getInventoryData(),
    getEventsData(),
    getShoppingListData(),
  ]);

  return {
    inventory,
    events,
    shoppingList,
  };
}
