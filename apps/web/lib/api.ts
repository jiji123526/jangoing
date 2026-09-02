import {
  AnnotationAssistantProposalSchema,
  AnnotationNormalizedValuesResponseSchema,
  AnnotationStatsSchema,
  AnnotationQueueResponseSchema,
  CreatedHouseholdResponseSchema,
  CurrentHouseholdResponseSchema,
  EventRecordSchema,
  FridgeSetupResponseSchema,
  FridgeSetupStatusSchema,
  HouseholdJoinCodeSchema,
  HouseholdMemberRemovalResponseSchema,
  HouseholdMembersResponseSchema,
  LoggedInterpretationSchema,
  InventoryItemSchema,
  JoinedHouseholdResponseSchema,
  ShoppingListItemSchema,
  type ConfirmActionRequest,
  type AnnotationAssistantProposal,
  type AnnotationQueueItem,
  type AnnotationQueueType,
  type AnnotationNormalizedValuesResponse,
  type AnnotationStats,
  type CreateAnnotationRequest,
  type EventRecord,
  type FridgeSetupRequest,
  type FridgeSetupResponse,
  type FridgeSetupStatus,
  type LoggedInterpretation,
  type UpdateInferenceOutcomeRequest,
  type InventoryItem,
  type ShoppingListItem,
  type ShoppingItemContextRequest,
  type ActivationMode,
  type AdjustInventoryItemRequest,
  type CreatedHouseholdResponse,
  type CurrentHouseholdResponse,
  type HouseholdJoinCode,
  type HouseholdMember,
  type HouseholdSummary,
  type JoinedHouseholdResponse,
  type UpdateHouseholdProfileRequest,
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

interface CachedAppToken {
  token: string;
  expiresAtMs: number;
}

let cachedAppToken: CachedAppToken | null = null;
let pendingAppToken: Promise<string | null> | null = null;
let signedOutRetryAfterMs = 0;

function pathUsesAppToken(path: string): boolean {
  return (
    path.startsWith("/households/") ||
    path === "/commands/interpret" ||
    path === "/inferences/outcome" ||
    path === "/events" ||
    path.startsWith("/events?") ||
    path === "/inventory" ||
    path.startsWith("/inventory/") ||
    path === "/shopping-list" ||
    path.startsWith("/shopping-list/") ||
    path === "/fridge-setup" ||
    path.startsWith("/fridge-setup/")
  );
}

function invalidateAppToken(): void {
  cachedAppToken = null;
  signedOutRetryAfterMs = 0;
}

async function requestAppToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedAppToken &&
    cachedAppToken.expiresAtMs - 30_000 > now
  ) {
    return cachedAppToken.token;
  }
  if (!forceRefresh && signedOutRetryAfterMs > now) return null;
  if (!forceRefresh && pendingAppToken) return pendingAppToken;

  const request = (async () => {
    const response = await fetch("/api/app-token", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      cachedAppToken = null;
      signedOutRetryAfterMs = Date.now() + 10_000;
      return null;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : "Could not issue app token";
      throw new Error(message);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("token" in body) ||
      typeof body.token !== "string" ||
      !("expires_at" in body) ||
      typeof body.expires_at !== "string"
    ) {
      throw new Error("Invalid app token response");
    }

    const expiresAtMs = Date.parse(body.expires_at);
    if (!Number.isFinite(expiresAtMs)) {
      throw new Error("Invalid app token expiration");
    }
    cachedAppToken = { token: body.token, expiresAtMs };
    signedOutRetryAfterMs = 0;
    return body.token;
  })();

  pendingAppToken = request;
  try {
    return await request;
  } finally {
    if (pendingAppToken === request) pendingAppToken = null;
  }
}

async function apiRequest(
  path: string,
  init?: RequestInit,
  retryAuthentication = true,
): Promise<unknown> {
  const token = pathUsesAppToken(path)
    ? await requestAppToken(!retryAuthentication)
    : null;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token && retryAuthentication) {
      invalidateAppToken();
      return apiRequest(path, init, false);
    }
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
const HouseholdJoinCodeResponseSchema = z.object({
  join_code: HouseholdJoinCodeSchema,
});
const HouseholdJoinCodeRevokeResponseSchema = z.object({
  success: z.literal(true),
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

export async function getCurrentHousehold(): Promise<CurrentHouseholdResponse> {
  const body = await apiRequest("/households/current");
  return CurrentHouseholdResponseSchema.parse(body);
}

export async function updateHouseholdProfile(
  update: UpdateHouseholdProfileRequest,
): Promise<HouseholdSummary> {
  const body = await apiRequest("/households/current", {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return JoinedHouseholdResponseSchema.parse(body).household;
}

export async function createHousehold(
  name: string,
): Promise<CreatedHouseholdResponse> {
  const body = await apiRequest("/households/create", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return CreatedHouseholdResponseSchema.parse(body);
}

export async function joinHousehold(
  code: string,
): Promise<JoinedHouseholdResponse> {
  const body = await apiRequest("/households/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return JoinedHouseholdResponseSchema.parse(body);
}

export async function createHouseholdJoinCode(): Promise<HouseholdJoinCode> {
  const body = await apiRequest("/households/join-code", {
    method: "POST",
  });
  return HouseholdJoinCodeResponseSchema.parse(body).join_code;
}

export async function revokeHouseholdJoinCode(): Promise<void> {
  const body = await apiRequest("/households/join-code/revoke", {
    method: "POST",
  });
  HouseholdJoinCodeRevokeResponseSchema.parse(body);
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
  const body = await apiRequest("/households/members");
  return HouseholdMembersResponseSchema.parse(body).members;
}

export async function removeHouseholdMember(userId: string): Promise<void> {
  const body = await apiRequest(
    `/households/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  HouseholdMemberRemovalResponseSchema.parse(body);
}

export async function getFridgeSetupStatus(): Promise<FridgeSetupStatus> {
  const body = await apiRequest("/fridge-setup/status");
  return FridgeSetupStatusSchema.parse(body);
}

export async function completeFridgeSetup(
  setup: FridgeSetupRequest,
): Promise<FridgeSetupResponse> {
  const body = await apiRequest("/fridge-setup", {
    method: "POST",
    body: JSON.stringify(setup),
  });
  return FridgeSetupResponseSchema.parse(body);
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

export async function getEventsData(since?: string): Promise<EventRecord[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const body = await apiRequest(`/events${query}`);
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
