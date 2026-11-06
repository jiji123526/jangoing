import type { InterpretCommandRequest } from "@jangoing/contracts";
import {
  extractInlineExpiry,
  resolveTemporalGrounding,
} from "./temporal-grounding";
import {
  RawNluResultSchema,
  type RawEntitySpan,
  type RawNluAction,
  type RawNluResult,
  type RawSlots,
} from "./nlu-contracts";
import { normalizeNluResult } from "./normalization";

const quantityPattern =
  "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?)";
const unitPattern =
  "(bags?|bottles?|cans?|cartons?|dozens?|jars?|packs?|pieces?)";
const quantityTokenPattern =
  "a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?";
const unitTokenPattern =
  "bags?|bottles?|cans?|cartons?|dozens?|jars?|packs?|pieces?";

type RawItemPhrase = Pick<RawSlots, "item_name" | "quantity" | "unit">;

function parseItemPhrase(value: string): RawItemPhrase {
  const phrasePattern = new RegExp(
    `^(?:${quantityPattern}\\s+)?(?:${unitPattern}\\s+(?:of\\s+)?)?(.+)$`,
    "i",
  );
  const match = value.trim().match(phrasePattern);

  if (!match) {
    return { item_name: value.trim() };
  }

  return {
    item_name: match[3].trim(),
    ...(match[1] ? { quantity: match[1] } : {}),
    ...(match[2] ? { unit: match[2] } : {}),
  };
}

function splitItemPhrases(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.includes(",")) {
    return [trimmed];
  }

  const segments = trimmed
    .split(/\s*,\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return [trimmed];
  }

  const last = segments.pop();
  const phrases = [...segments];
  if (last) {
    const normalizedLast = last.replace(/^(?:and|&)\s+/i, "").trim();
    const tail = normalizedLast
      .split(/\s+(?:and|&)\s+/i)
      .map((segment) => segment.trim())
      .filter(Boolean);
    phrases.push(...(tail.length > 0 ? tail : [normalizedLast]));
  }
  return phrases;
}

function parseItemList(value: string): RawItemPhrase[] {
  return splitItemPhrases(value)
    .map((phrase) => parseItemPhrase(phrase))
    .filter((slots) => Boolean(slots.item_name));
}

function findEntitySpan(
  rawUtterance: string,
  value: string | undefined,
  type: RawEntitySpan["type"],
  fromIndex = 0,
): RawEntitySpan | undefined {
  if (!value) {
    return undefined;
  }

  const start = rawUtterance.toLocaleLowerCase().indexOf(
    value.toLocaleLowerCase(),
    fromIndex,
  );
  if (start < 0) {
    return undefined;
  }

  return {
    type,
    text: rawUtterance.slice(start, start + value.length),
    start,
    end: start + value.length,
  };
}

function entitySpans(
  rawUtterance: string,
  slots: RawSlots,
): RawEntitySpan[] {
  const candidates: Array<{
    value: string | undefined;
    type: RawEntitySpan["type"];
  }> = [
    { value: slots.item_name, type: "ITEM" },
    { value: slots.quantity ?? slots.low_threshold, type: "QUANTITY" },
    { value: slots.unit, type: "UNIT" },
    { value: slots.location, type: "LOCATION" },
    { value: slots.expiration_date, type: "EXPIRY_DATE" },
  ];

  const entities: RawEntitySpan[] = [];
  for (const candidate of candidates) {
    const entity = findEntitySpan(
      rawUtterance,
      candidate.value,
      candidate.type,
    );
    if (!entity) {
      continue;
    }
    entities.push(entity);
  }
  return entities.sort((left, right) => left.start - right.start);
}

function buildNluResult(
  rawUtterance: string,
  intent: RawNluResult["intent"],
  slots: RawSlots,
  confidence: number,
  actions?: Array<{
    intent: RawNluAction["intent"];
    slots: RawSlots;
  }>,
): RawNluResult {
  const rawActions = actions?.length && actions.length > 1
    ? actions.map((action) => ({
      intent: action.intent,
      slots: action.slots,
      entities: entitySpans(rawUtterance, action.slots),
    }))
    : undefined;

  return RawNluResultSchema.parse({
    raw_utterance: rawUtterance,
    intent,
    slots,
    entities: entitySpans(rawUtterance, slots),
    ...(rawActions ? { actions: rawActions } : {}),
    confidence,
  });
}

export function runRulesNlu(
  request: InterpretCommandRequest,
): RawNluResult {
  const rawUtterance = request.text.trim();
  const inlineExpiry = extractInlineExpiry(rawUtterance);
  const text = inlineExpiry.text;
  const expirationDate = request.expiration_date
    ?? inlineExpiry.expirationDateText;

  const thresholdPatterns: Array<{
    pattern: RegExp;
    itemIndex: number;
    quantityIndex: number;
    unitIndex: number;
  }> = [
    {
      pattern: new RegExp(
        `^(?:tell|notify|remind) me when (.+?) (?:reaches|gets to|drops to) (${quantityTokenPattern})(?:\\s+(${unitTokenPattern}))?$`,
        "i",
      ),
      itemIndex: 1,
      quantityIndex: 2,
      unitIndex: 3,
    },
    {
      pattern: new RegExp(
        `^(?:set|make) (?:the )?(?:low threshold|low point) for (.+?) (?:to|at) (${quantityTokenPattern})(?:\\s+(${unitTokenPattern}))?$`,
        "i",
      ),
      itemIndex: 1,
      quantityIndex: 2,
      unitIndex: 3,
    },
    {
      pattern: new RegExp(
        `^(?:set|make|change) (.+?)(?:'s)? (?:low threshold|low point|low at) (?:to |at )?(${quantityTokenPattern})(?:\\s+(${unitTokenPattern}))?$`,
        "i",
      ),
      itemIndex: 1,
      quantityIndex: 2,
      unitIndex: 3,
    },
    {
      pattern: new RegExp(
        `^(.+?) (?:is|are) low at (${quantityTokenPattern})(?:\\s+(${unitTokenPattern}))?$`,
        "i",
      ),
      itemIndex: 1,
      quantityIndex: 2,
      unitIndex: 3,
    },
    {
      pattern: new RegExp(
        `^(?:let me know|tell me) when (?:there is|there are|we have) (${quantityTokenPattern})(?:\\s+(${unitTokenPattern}))?(?:\\s+of)?\\s+(.+?) left$`,
        "i",
      ),
      itemIndex: 3,
      quantityIndex: 1,
      unitIndex: 2,
    },
  ];

  for (const { pattern, itemIndex, quantityIndex, unitIndex } of thresholdPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    return buildNluResult(
      rawUtterance,
      "set_low_threshold",
      {
        item_name: match[itemIndex],
        low_threshold: match[quantityIndex],
        ...(match[unitIndex] ? { unit: match[unitIndex] } : {}),
      },
      0.95,
    );
  }

  const shoppingMatch = text.match(
    /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?shopping list$/i,
  );
  if (shoppingMatch) {
    const itemList = parseItemList(shoppingMatch[1]);
    if (itemList.length > 1) {
      return buildNluResult(
        rawUtterance,
        "add_to_buy",
        itemList[0],
        0.96,
        itemList.map((slots) => ({
          intent: "add_to_buy",
          slots,
        })),
      );
    }
    return buildNluResult(
      rawUtterance,
      "add_to_buy",
      parseItemPhrase(shoppingMatch[1]),
      0.96,
    );
  }

  const needMatch = text.match(/^(?:we need|buy|get)\s+(.+)$/i);
  if (needMatch) {
    const itemList = parseItemList(needMatch[1]);
    if (itemList.length > 1) {
      return buildNluResult(
        rawUtterance,
        "add_to_buy",
        itemList[0],
        0.88,
        itemList.map((slots) => ({
          intent: "add_to_buy",
          slots,
        })),
      );
    }
    return buildNluResult(
      rawUtterance,
      "add_to_buy",
      parseItemPhrase(needMatch[1]),
      0.88,
    );
  }

  const outPatterns = [
    /^(?:(?:we are|we're)\s+)?out of\s+(.+)$/i,
    /^(?:(?:we have|we've got|there is|there's|there are)\s+)?no\s+(.+?)(?:\s+left)?$/i,
    /^(?:we do not have|we don't have)\s+(?:any\s+)?(.+?)(?:\s+left)?$/i,
    /^(.+?)\s+(?:is|are)\s+gone$/i,
  ];

  for (const pattern of outPatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    return buildNluResult(
      rawUtterance,
      "mark_out",
      parseItemPhrase(match[1]),
      0.95,
    );
  }

  const lowMatch = text.match(
    /^(?:(?:we are|we're|we have|we've got)\s+)?(?:low on|almost out of|running low on)\s+(.+)$/i,
  );
  if (lowMatch) {
    return buildNluResult(
      rawUtterance,
      "mark_low",
      parseItemPhrase(lowMatch[1]),
      0.96,
    );
  }

  const itemLowMatch = text.match(
    /^(.+?)\s+(?:is|are)\s+(?:low|almost gone)$/i,
  );
  if (itemLowMatch) {
    return buildNluResult(
      rawUtterance,
      "mark_low",
      parseItemPhrase(itemLowMatch[1]),
      0.9,
    );
  }

  const throwMatch = text.match(/^(?:throw away|discard)\s+(.+)$/i);
  if (throwMatch) {
    return buildNluResult(
      rawUtterance,
      "throw_away",
      parseItemPhrase(throwMatch[1]),
      0.96,
    );
  }

  const consumeMatch = text.match(
    /^(?:i\s+)?(?:used|ate|drank|finished)\s+(.+)$/i,
  );
  if (consumeMatch) {
    return buildNluResult(
      rawUtterance,
      "consume_item",
      parseItemPhrase(consumeMatch[1]),
      0.9,
    );
  }

  const queryMatch = text.match(
    /^(?:do we have|is there|are there(?: any)?)\s+(.+)$/i,
  );
  if (queryMatch) {
    return buildNluResult(
      rawUtterance,
      "query_inventory",
      parseItemPhrase(queryMatch[1]),
      0.94,
    );
  }

  const addMatch = text.match(
    /^(?:add|put)\s+(.+?)(?:\s+(?:to|in)\s+(?:the\s+)?(inventory|fridge|freezer|pantry))?$/i,
  );
  if (addMatch) {
    const location =
      addMatch[2]?.toLowerCase() === "inventory"
        ? "fridge"
        : addMatch[2]?.toLowerCase() ?? "fridge";
    const itemList = parseItemList(addMatch[1]);
    if (itemList.length > 1) {
      const actions = itemList.map((item) => ({
        intent: "add_item" as const,
        slots: {
          ...item,
          location,
          ...(expirationDate ? { expiration_date: expirationDate } : {}),
        },
      }));
      return buildNluResult(
        rawUtterance,
        "add_item",
        actions[0].slots,
        0.94,
        actions,
      );
    }
    return buildNluResult(
      rawUtterance,
      "add_item",
      {
        ...parseItemPhrase(addMatch[1]),
        location,
        ...(expirationDate ? { expiration_date: expirationDate } : {}),
      },
      0.94,
    );
  }

  return buildNluResult(rawUtterance, "unknown", {}, 0.2);
}

/**
 * Parser-focused compatibility helper. Runtime requests use the explicit
 * NLU -> normalization pipeline instead.
 */
export function parseCommand(request: InterpretCommandRequest) {
  const nlu = runRulesNlu(request);
  const temporalContext = resolveTemporalGrounding(request);
  return normalizeNluResult(nlu, temporalContext).interpretation;
}
