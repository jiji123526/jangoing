import {
  EntityResolutionSchema,
  InterpretationSchema,
  itemNameMatchKeys,
  type EntityResolution,
  type Interpretation,
} from "@jangoing/contracts";
import catalog from "../../../../ml/taxonomy/grocery-v1.json";
import {
  StageTraceSchema,
  type StageTrace,
} from "./pipeline-contracts";
import {
  normalizePersonalSurface,
  type CorrectionHint,
  type HouseholdEntityAlias,
} from "./personal-adapter";

export const catalogResolverVersion = "catalog-v1";

type CatalogProduct = {
  id: string;
  category_id: string;
  aliases?: Record<string, string[]>;
};

type CatalogAlias = {
  product: CatalogProduct;
  alias: string;
  source: "shared_catalog";
};

const products = catalog.products as CatalogProduct[];

function normalizedSurface(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ");
}

function catalogAliases(product: CatalogProduct): CatalogAlias[] {
  const aliases = Object.values(product.aliases ?? {}).flat();
  return [
    {
      product,
      alias: product.id.replace(/_/g, " "),
      source: "shared_catalog" as const,
    },
    ...aliases.map((alias) => ({
      product,
      alias,
      source: "shared_catalog" as const,
    })),
  ];
}

const exactAliasIndex = new Map<string, CatalogAlias[]>();
for (const product of products) {
  for (const entry of catalogAliases(product)) {
    const key = normalizedSurface(entry.alias);
    const entries = exactAliasIndex.get(key) ?? [];
    entries.push(entry);
    exactAliasIndex.set(key, entries);
  }
}

function candidateFor(
  entry: CatalogAlias,
  score: number,
  source: "shared_catalog" | "household_alias" | "correction_hint" =
    "shared_catalog",
): EntityResolution["candidates"][number] {
  return {
    canonical_key: entry.product.id,
    category_id: entry.product.category_id,
    matched_alias: entry.alias,
    score,
    source,
  };
}

function uniqueCandidates(
  entries: Array<{
    entry: CatalogAlias;
    score: number;
    source?: "shared_catalog" | "household_alias" | "correction_hint";
  }>,
): EntityResolution["candidates"] {
  const byProduct = new Map<string, EntityResolution["candidates"][number]>();
  for (const { entry, score, source } of entries) {
    const candidate = candidateFor(entry, score, source ?? entry.source);
    const current = byProduct.get(candidate.canonical_key);
    if (!current || candidate.score > current.score) {
      byProduct.set(candidate.canonical_key, candidate);
    }
  }

  return [...byProduct.values()]
    .sort((left, right) =>
      right.score - left.score ||
      left.canonical_key.localeCompare(right.canonical_key)
    )
    .slice(0, 4);
}

export interface EntityResolutionContext {
  household_id?: string;
  aliases?: readonly HouseholdEntityAlias[];
  correction_hints?: readonly CorrectionHint[];
}

function personalCandidates(
  surface: string,
  context: EntityResolutionContext,
): Array<{
  entry: CatalogAlias;
  score: number;
  source: "household_alias" | "correction_hint";
}> {
  if (!context.household_id) {
    return [];
  }

  const normalized = normalizePersonalSurface(surface);
  const candidates: Array<{
    entry: CatalogAlias;
    score: number;
    source: "household_alias" | "correction_hint";
  }> = [];

  for (const alias of context.aliases ?? []) {
    if (
      alias.household_id !== context.household_id ||
      normalizePersonalSurface(alias.normalized_surface) !== normalized
    ) {
      continue;
    }
    candidates.push({
      entry: {
        product: {
          id: alias.canonical_key,
          category_id: alias.category_id,
        },
        alias: alias.surface,
        source: "shared_catalog",
      },
      score: Math.min(0.99, alias.confidence),
      source: "household_alias",
    });
  }

  for (const hint of context.correction_hints ?? []) {
    if (
      hint.household_id !== context.household_id ||
      normalizePersonalSurface(hint.normalized_surface) !== normalized
    ) {
      continue;
    }
    candidates.push({
      entry: {
        product: {
          id: hint.canonical_key,
          category_id: hint.category_id,
        },
        alias: hint.surface,
        source: "shared_catalog",
      },
      score: Math.min(0.99, hint.confidence),
      source: "correction_hint",
    });
  }

  return candidates;
}

export function resolveCatalogItem(
  value: string,
  context: EntityResolutionContext = {},
): EntityResolution {
  const surface = value.trim();
  const exactEntries = exactAliasIndex.get(normalizedSurface(surface)) ?? [];
  let candidates = uniqueCandidates([
    ...exactEntries.map((entry) => ({ entry, score: 1 })),
    ...personalCandidates(surface, context),
  ]);

  if (candidates.length === 0) {
    const inflectionEntries: Array<{ entry: CatalogAlias; score: number }> = [];
    const variantKeys = new Set(
      itemNameMatchKeys(surface).map(normalizedSurface),
    );

    for (const [key, entries] of exactAliasIndex) {
      if (!variantKeys.has(key)) {
        continue;
      }
      for (const entry of entries) {
        inflectionEntries.push({ entry, score: 0.96 });
      }
    }
    candidates = uniqueCandidates(inflectionEntries);
  }

  const status = candidates.length === 0
    ? "unresolved"
    : candidates.length === 1
      ? "resolved"
      : "ambiguous";
  return EntityResolutionSchema.parse({
    surface,
    status,
    ...(status === "resolved"
      ? { canonical_key: candidates[0].canonical_key }
      : {}),
    candidates,
    resolver_version: catalogResolverVersion,
  });
}

export interface EntityResolutionResult {
  interpretation: Interpretation;
  trace: StageTrace;
}

function addResolution(
  interpretation: Interpretation,
  context: EntityResolutionContext,
): Interpretation {
  const primaryResolution = interpretation.slots.item_name
    ? resolveCatalogItem(interpretation.slots.item_name, context)
    : undefined;
  const actions = interpretation.actions?.map((action) => ({
    ...action,
    ...(action.slots.item_name
      ? {
        entity_resolution: resolveCatalogItem(action.slots.item_name, context),
      }
      : {}),
  }));

  return InterpretationSchema.parse({
    ...interpretation,
    ...(primaryResolution ? { entity_resolution: primaryResolution } : {}),
    ...(actions ? { actions } : {}),
  });
}

export function resolveInterpretationEntities(
  interpretation: Interpretation,
  context: EntityResolutionContext = {},
): EntityResolutionResult {
  const startedAt = Date.now();
  const resolvedInterpretation = addResolution(interpretation, context);
  const trace = StageTraceSchema.parse({
    stage: "entity_resolution",
    status: "completed",
    version: catalogResolverVersion,
    latency_ms: Date.now() - startedAt,
    confidence: resolvedInterpretation.entity_resolution
      ? resolvedInterpretation.entity_resolution.candidates[0]?.score ?? 0
      : 0,
    reason_code: "catalog_resolution_baseline",
  });

  return {
    interpretation: resolvedInterpretation,
    trace,
  };
}
