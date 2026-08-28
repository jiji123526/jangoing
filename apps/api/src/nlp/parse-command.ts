import type {
  CommandSlots,
  InterpretCommandRequest,
  Interpretation,
} from "@jangoing/contracts";
import {
  extractInlineExpiry,
  normalizeExpiryDate,
  resolveTemporalGrounding,
} from "./temporal-grounding";

const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const unitAliases: Record<string, string> = {
  bags: "bag",
  bottles: "bottle",
  cans: "can",
  cartons: "carton",
  dozens: "dozen",
  jars: "jar",
  packs: "pack",
  pieces: "piece",
};

const itemAliases: Record<string, string> = {
  eggs: "egg",
  yogurts: "yogurt",
};

const quantityPattern =
  "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\.\\d+)?)";
const unitPattern =
  "(bags?|bottles?|cans?|cartons?|dozens?|jars?|packs?|pieces?)";

function cleanItem(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[?.!,]+$/g, "")
    .replace(/^(?:any|some|the)\s+/i, "")
    .replace(/\s+please$/i, "")
    .trim();

  return itemAliases[cleaned] ?? cleaned;
}

function parseQuantity(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  return numberWords[value] ?? Number(value);
}

function parseItemPhrase(value: string): Pick<
  CommandSlots,
  "item_name" | "quantity" | "unit"
> {
  const phrasePattern = new RegExp(
    `^(?:${quantityPattern}\\s+)?(?:${unitPattern}\\s+(?:of\\s+)?)?(.+)$`,
    "i",
  );
  const match = value.trim().match(phrasePattern);

  if (!match) {
    return { item_name: cleanItem(value) };
  }

  const quantity = parseQuantity(match[1]?.toLowerCase());
  const rawUnit = match[2]?.toLowerCase();
  const unit = rawUnit ? (unitAliases[rawUnit] ?? rawUnit) : undefined;

  return {
    item_name: cleanItem(match[3]),
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
  };
}

function interpretation(
  rawUtterance: string,
  intent: Interpretation["intent"],
  slots: CommandSlots,
  confidence: number,
): Interpretation {
  return {
    intent,
    slots,
    confidence,
    requires_confirmation:
      intent === "throw_away" || intent === "mark_out" || confidence < 0.85,
    raw_utterance: rawUtterance,
  };
}

export function parseCommand(
  request: InterpretCommandRequest,
): Interpretation {
  const rawUtterance = request.text.trim();
  const inlineExpiry = extractInlineExpiry(rawUtterance);
  const text = inlineExpiry.text;
  const temporalContext = resolveTemporalGrounding(request);
  const expirationDate = request.expiration_date
    ?? normalizeExpiryDate(inlineExpiry.expirationDateText, temporalContext);

  const shoppingMatch = text.match(
    /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?shopping list$/i,
  );
  if (shoppingMatch) {
    return interpretation(
      rawUtterance,
      "add_to_buy",
      parseItemPhrase(shoppingMatch[1]),
      0.96,
    );
  }

  const needMatch = text.match(/^(?:we need|buy|get)\s+(.+)$/i);
  if (needMatch) {
    return interpretation(
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

    return interpretation(
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
    return interpretation(
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
    return interpretation(
      rawUtterance,
      "mark_low",
      parseItemPhrase(itemLowMatch[1]),
      0.9,
    );
  }

  const throwMatch = text.match(/^(?:throw away|discard)\s+(.+)$/i);
  if (throwMatch) {
    return interpretation(
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
    return interpretation(
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
    return interpretation(
      rawUtterance,
      "query_inventory",
      parseItemPhrase(queryMatch[1]),
      0.94,
    );
  }

  const addMatch = text.match(
    /^(?:add|put)\s+(.+?)(?:\s+(?:to|in)\s+(?:the\s+)?(fridge|freezer|pantry))?$/i,
  );
  if (addMatch) {
    const slots: CommandSlots = {
      ...parseItemPhrase(addMatch[1]),
      location:
        (addMatch[2]?.toLowerCase() as CommandSlots["location"]) ?? "fridge",
      ...(expirationDate ? { expiration_date: expirationDate } : {}),
    };

    return interpretation(rawUtterance, "add_item", slots, 0.94);
  }

  return interpretation(rawUtterance, "unknown", {}, 0.2);
}
