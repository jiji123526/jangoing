import {
  AnnotationActionSchema,
  AnnotationPhraseFamilies,
  EntityLabelSchema,
  IntentSchema,
  type AnnotationAction,
  type AnnotationAssistantProposal,
  type Interpretation,
} from "@jangoing/contracts";
import { z } from "zod";

export const annotationAssistantPromptVersion = "annotation-ai-v3";

export interface InferenceProposalContext {
  inference_id: string;
  raw_utterance: string;
  predicted_interpretation: Interpretation;
}

export interface ProposalEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export interface AnnotationAssistantUsage {
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface StoredProposalRecord extends AnnotationAssistantProposal {}

const LlmEntityDraftSchema = z.object({
  label: EntityLabelSchema,
  text: z.string().trim().min(1).max(200).optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().positive().optional(),
  normalized_value: z.union([z.string(), z.number()]).optional(),
});

const LlmActionDraftSchema = z.object({
  intent: IntentSchema,
  entities: z.array(LlmEntityDraftSchema).max(20),
  phrase_family: z.string().trim().max(120).nullable().optional(),
});

const LlmProposalDraftSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
  actions: z.array(LlmActionDraftSchema).min(1).max(8),
});

type LlmProposalDraft = z.infer<typeof LlmProposalDraftSchema>;

function uniqueEntityTextRanges(
  rawUtterance: string,
  entityText: string,
): Array<{ start: number; end: number; text: string }> {
  const haystack = rawUtterance.toLowerCase();
  const needle = entityText.toLowerCase();
  const ranges: Array<{ start: number; end: number; text: string }> = [];

  let searchIndex = 0;
  while (searchIndex < haystack.length) {
    const start = haystack.indexOf(needle, searchIndex);
    if (start === -1) {
      break;
    }

    ranges.push({
      start,
      end: start + entityText.length,
      text: rawUtterance.slice(start, start + entityText.length),
    });
    searchIndex = start + needle.length;
  }

  return ranges;
}

function materializeAction(
  rawUtterance: string,
  action: LlmProposalDraft["actions"][number],
): AnnotationAction {
  const usedRanges: Array<{ start: number; end: number }> = [];

  const entities = action.entities.flatMap((entity) => {
    if (!entity.text) {
      return [];
    }

    const suppliedRange = entity.start !== undefined && entity.end !== undefined
      && entity.start < entity.end
      && rawUtterance.slice(entity.start, entity.end) === entity.text
      ? {
          start: entity.start,
          end: entity.end,
          text: entity.text,
        }
      : null;

    const match = [
      ...(suppliedRange ? [suppliedRange] : []),
      ...uniqueEntityTextRanges(rawUtterance, entity.text),
    ].find((candidate) =>
      usedRanges.every((range) => candidate.end <= range.start || candidate.start >= range.end),
    );

    if (!match) {
      return [];
    }

    usedRanges.push({ start: match.start, end: match.end });
    return [{
      label: entity.label,
      start: match.start,
      end: match.end,
      text: match.text,
      ...(entity.normalized_value !== undefined
        ? { normalized_value: entity.normalized_value }
        : {}),
    }];
  });

  const allowedFamilies = AnnotationPhraseFamilies[action.intent] as readonly string[];
  const phraseFamily = action.phrase_family && allowedFamilies.includes(action.phrase_family)
    ? action.phrase_family
    : null;

  return AnnotationActionSchema.parse({
    intent: action.intent,
    phrase_family: phraseFamily,
    entities,
  });
}

export function materializeProposalDraft(
  rawUtterance: string,
  draft: unknown,
): AnnotationAction[] {
  const parsed = LlmProposalDraftSchema.parse(draft);
  return parsed.actions.map((action) => materializeAction(rawUtterance, action));
}

function parserFallbackActions(context: InferenceProposalContext): AnnotationAction[] {
  return [{
    intent: context.predicted_interpretation.intent,
    phrase_family: null,
    entities: [],
  }];
}

function systemPrompt(): string {
  return [
    "You draft annotation suggestions for a grocery inventory NLP dataset.",
    "Return JSON only.",
    "Create 1 to 8 actions.",
    "Each action must contain:",
    "- intent",
    "- phrase_family selected from allowed_phrase_families for that action's intent, or null only when no family is semantically supported",
    "- entities with label, exact text from the utterance, start, end, and normalized_value when clear",
    "Entity start is the zero-based inclusive character offset and end is the zero-based exclusive offset.",
    "The utterance slice from start to end must exactly equal entity text, including case and punctuation.",
    "Label every useful span, including ITEM, ITEM_CONDITION, QUANTITY, UNIT, LOCATION, EXPIRY_DATE, and CATEGORY when present.",
    "Use ITEM_CONDITION for modifiers like ripe, frozen, fresh, expired, spoiled, or moldy when they describe the item's state, and use ITEM for the item noun itself.",
    "Do not invent text that does not appear in the utterance.",
    "If unsure, omit the entity instead of hallucinating it.",
    "Prefer conservative intents such as needs_clarification over overcommitting.",
  ].join("\n");
}

function userPrompt(context: InferenceProposalContext): string {
  return JSON.stringify({
    raw_utterance: context.raw_utterance,
    parser_prediction: context.predicted_interpretation,
    allowed_intents: IntentSchema.options,
    allowed_phrase_families: AnnotationPhraseFamilies,
    output_shape: {
      note: "string or null",
      actions: [{
        intent: "one allowed intent",
        phrase_family: "string or null",
        entities: [{
          label: "entity label",
          text: "exact substring",
          start: "inclusive integer offset",
          end: "exclusive integer offset",
          normalized_value: "canonical string or number when clear",
        }],
      }],
    },
  });
}

function parseOpenAiJson(text: string): LlmProposalDraft {
  return LlmProposalDraftSchema.parse(JSON.parse(text));
}

async function requestOpenAiDraft(
  env: ProposalEnv,
  context: InferenceProposalContext,
): Promise<{ provider: string; model: string; note: string | null; actions: AnnotationAction[]; usage: AnnotationAssistantUsage | null }> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "parser-fallback",
      model: "rules-v1",
      note: "OPENAI_API_KEY is not configured, so this draft uses the deterministic parser as a fallback.",
      actions: parserFallbackActions(context),
      usage: null,
    };
  }

  const model = env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(context) },
      ],
    }),
  });

  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`OpenAI proposal request failed: ${response.status} ${failure}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI proposal response did not include message content");
  }

  const draft = parseOpenAiJson(content);
  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;
  return {
    provider: "openai",
    model,
    note: draft.note ?? null,
    actions: materializeProposalDraft(context.raw_utterance, draft),
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: (inputTokens * 0.4 + outputTokens * 1.6) / 1_000_000,
    },
  };
}

export async function buildAnnotationAssistantProposal(
  env: ProposalEnv,
  context: InferenceProposalContext,
): Promise<Omit<StoredProposalRecord, "proposal_id" | "created_at" | "inference_id"> & { usage: AnnotationAssistantUsage | null }> {
  const generated = await requestOpenAiDraft(env, context);
  return {
    provider: generated.provider,
    model: generated.model,
    prompt_version: annotationAssistantPromptVersion,
    note: generated.note,
    actions: generated.actions,
    usage: generated.usage,
  };
}

export function proposalMatchesActions(
  proposal: Pick<AnnotationAssistantProposal, "actions">,
  actions: AnnotationAction[],
): boolean {
  return JSON.stringify(proposal.actions) === JSON.stringify(actions);
}
