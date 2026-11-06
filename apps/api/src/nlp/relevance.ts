import {
  AnnotationNormalizedValues,
  RelevanceSchema,
  type InterpretCommandRequest,
  type Interpretation,
  type Relevance,
} from "@jangoing/contracts";
import { StageTraceSchema, type StageTrace } from "./pipeline-contracts";

export const relevanceVersion = "rules-relevance-v1";

export interface RelevanceResult {
  relevance: Relevance;
  confidence: number;
  passesToNlu: boolean;
  trace: StageTrace;
}

const domainTerms = [
  "inventory",
  "fridge",
  "freezer",
  "pantry",
  "shopping list",
  "groceries",
  "grocery",
  "expiry",
  "expiration",
  "low stock",
  "threshold",
  "low on",
  "almost out",
  "running low",
  "food",
  "meal",
  "recipe",
  "ingredient",
  "kitchen",
  "drink",
  "snack",
  "produce",
  "dairy",
];

const kitchenTerms = [
  ...AnnotationNormalizedValues.ITEM,
  ...domainTerms,
].map((term) => term.replaceAll("_", " "));

const preferencePattern =
  /\b(?:i|we|our household)\s+(?:really\s+)?(?:prefer|like|love|avoid|hate|don't like|do not like|only buy|usually buy)\b|\b(?:allergic|allergy|vegan|vegetarian|gluten[- ]free|dairy[- ]free)\b/i;

const domainNonActionablePatterns = [
  /^(?:the\s+)?recipe\b.*\b(?:says|calls for|uses|needs)\b/i,
  /^(?:i|we)\s+(?:had|ate|drank)\b.*\b(?:yesterday|earlier|for dinner|at lunch)\b/i,
  /\b(?:price|cost|expensive|cheap|on sale|nutrition|calories|restaurant|store availability|compare|comparison)\b/i,
  /\b(?:is|are|was|were)\s+(?:fresh|stale|ripe|overripe|expensive|cheap|on sale)\b/i,
];

const actionablePatterns = [
  /^(?:add|put)\b/i,
  /^(?:we need|buy|get)\b/i,
  /^(?:i|we)\s+(?:bought|purchased|picked up)\b/i,
  /^(?:tell|notify|remind) me when\b/i,
  /^(?:set|make|change)\b.*\b(?:low threshold|low point)\b/i,
  /\b(?:out of|no|do not have|don't have|low on|almost out of|running low on)\b/i,
  /^(?:throw away|discard|used|ate|drank|finished)\b/i,
  /^(?:do we have|is there|are there)\b/i,
  /\b(?:expir(?:e|es|ed|ing)|best by|use by)\b/i,
];

function hasKitchenVocabulary(text: string): boolean {
  const normalized = text.toLowerCase();
  return kitchenTerms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\b)${escaped}(?:s)?(?:\\b|$)`, "i").test(normalized);
  });
}

function classify(
  text: string,
): Pick<RelevanceResult, "relevance" | "confidence" | "passesToNlu"> {
  const hasKitchenContext = hasKitchenVocabulary(text);

  if (preferencePattern.test(text) && hasKitchenContext) {
    return {
      relevance: "contextual_preference",
      confidence: 0.97,
      passesToNlu: false,
    };
  }

  if (
    hasKitchenContext &&
    domainNonActionablePatterns.some((pattern) => pattern.test(text))
  ) {
    return {
      relevance: "domain_non_actionable",
      confidence: 0.94,
      passesToNlu: false,
    };
  }

  if (hasKitchenContext && actionablePatterns.some((pattern) => pattern.test(text))) {
    return {
      relevance: "actionable",
      confidence: 0.96,
      passesToNlu: true,
    };
  }

  if (!hasKitchenContext) {
    return {
      relevance: "unrelated",
      confidence: 0.99,
      passesToNlu: false,
    };
  }

  return {
    relevance: "actionable",
    confidence: 0.55,
    passesToNlu: true,
  };
}

const relevanceReasonCodes: Record<
  Relevance,
  Exclude<StageTrace["reason_code"], undefined>
> = {
  actionable: "relevance_actionable",
  contextual_preference: "relevance_contextual_preference",
  domain_non_actionable: "relevance_domain_non_actionable",
  unrelated: "relevance_unrelated",
};

function reasonCodeFor(
  relevance: Relevance,
  confidence: number,
): StageTrace["reason_code"] {
  if (relevance === "actionable" && confidence < 0.8) {
    return "relevance_ambiguous";
  }
  return relevanceReasonCodes[relevance];
}

export function runRelevanceGate(
  request: InterpretCommandRequest,
): RelevanceResult {
  const startedAt = Date.now();
  const classification = classify(request.text.trim());
  const relevance = RelevanceSchema.parse(classification.relevance);
  const trace = StageTraceSchema.parse({
    stage: "relevance",
    status: classification.passesToNlu
      ? classification.confidence < 0.8 ? "fallback" : "completed"
      : "rejected",
    version: relevanceVersion,
    latency_ms: Date.now() - startedAt,
    confidence: classification.confidence,
    reason_code: reasonCodeFor(relevance, classification.confidence),
  });

  return { ...classification, relevance, trace };
}

export function buildNonActionableInterpretation(
  request: InterpretCommandRequest,
  result: RelevanceResult,
): Interpretation {
  return {
    intent: "unknown",
    slots: {},
    confidence: 0.2,
    requires_confirmation: false,
    raw_utterance: request.text.trim(),
    relevance: result.relevance,
    relevance_confidence: result.confidence,
    relevance_version: relevanceVersion,
  };
}
