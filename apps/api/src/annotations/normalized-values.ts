import {
  AnnotationNormalizedValues,
  AnnotationNormalizedValuesResponseSchema,
  type AnnotationNormalizedValuesResponse,
  type EntityAnnotation,
} from "@jangoing/contracts";

export interface AnnotationNormalizedValueRow {
  actions: string | null;
  entities: string | null;
}

function emptyAnnotationNormalizedValues(): AnnotationNormalizedValuesResponse {
  return {
    ITEM: [...AnnotationNormalizedValues.ITEM],
    ITEM_CONDITION: [...AnnotationNormalizedValues.ITEM_CONDITION],
    CATEGORY: [...AnnotationNormalizedValues.CATEGORY],
    QUANTITY: [...AnnotationNormalizedValues.QUANTITY],
    UNIT: [...AnnotationNormalizedValues.UNIT],
    LOCATION: [...AnnotationNormalizedValues.LOCATION],
    EXPIRY_DATE: [...AnnotationNormalizedValues.EXPIRY_DATE],
  };
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isEntityAnnotation(value: unknown): value is EntityAnnotation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EntityAnnotation>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.start === "number" &&
    typeof candidate.end === "number" &&
    typeof candidate.text === "string"
  );
}

function readEntities(row: AnnotationNormalizedValueRow): EntityAnnotation[] {
  const parsedActions = parseJson(row.actions);
  if (Array.isArray(parsedActions)) {
    const entities = parsedActions.flatMap((action) => {
      if (!action || typeof action !== "object") return [];
      const candidate = action as { entities?: unknown };
      return Array.isArray(candidate.entities)
        ? candidate.entities.filter(isEntityAnnotation)
        : [];
    });
    if (entities.length > 0) {
      return entities;
    }
  }

  const parsedEntities = parseJson(row.entities);
  return Array.isArray(parsedEntities)
    ? parsedEntities.filter(isEntityAnnotation)
    : [];
}

export function collectAnnotationNormalizedValues(
  rows: AnnotationNormalizedValueRow[],
): AnnotationNormalizedValuesResponse {
  const values = emptyAnnotationNormalizedValues();
  const stringBuckets = {
    ITEM: new Set(values.ITEM),
    ITEM_CONDITION: new Set(values.ITEM_CONDITION),
    CATEGORY: new Set(values.CATEGORY),
    UNIT: new Set(values.UNIT),
    LOCATION: new Set(values.LOCATION),
    EXPIRY_DATE: new Set(values.EXPIRY_DATE),
  };
  const quantityBucket = new Set(values.QUANTITY);

  for (const row of rows) {
    for (const entity of readEntities(row)) {
      if (entity.normalized_value === undefined) {
        continue;
      }

      if (entity.label === "QUANTITY") {
        const quantity = typeof entity.normalized_value === "number"
          ? entity.normalized_value
          : Number(entity.normalized_value);
        if (Number.isFinite(quantity) && quantity > 0) {
          quantityBucket.add(quantity);
        }
        continue;
      }

      if (typeof entity.normalized_value !== "string") {
        continue;
      }

      const normalizedValue = entity.normalized_value.trim();
      if (!normalizedValue) {
        continue;
      }

      if (entity.label === "ITEM") stringBuckets.ITEM.add(normalizedValue);
      if (entity.label === "ITEM_CONDITION") stringBuckets.ITEM_CONDITION.add(normalizedValue);
      if (entity.label === "CATEGORY") stringBuckets.CATEGORY.add(normalizedValue);
      if (entity.label === "UNIT") stringBuckets.UNIT.add(normalizedValue);
      if (entity.label === "LOCATION") stringBuckets.LOCATION.add(normalizedValue);
      if (entity.label === "EXPIRY_DATE") stringBuckets.EXPIRY_DATE.add(normalizedValue);
    }
  }

  return AnnotationNormalizedValuesResponseSchema.parse({
    ITEM: [...stringBuckets.ITEM].sort((left, right) => left.localeCompare(right)),
    ITEM_CONDITION: [...stringBuckets.ITEM_CONDITION].sort((left, right) => left.localeCompare(right)),
    CATEGORY: [...stringBuckets.CATEGORY].sort((left, right) => left.localeCompare(right)),
    QUANTITY: [...quantityBucket].sort((left, right) => left - right),
    UNIT: [...stringBuckets.UNIT].sort((left, right) => left.localeCompare(right)),
    LOCATION: [...stringBuckets.LOCATION].sort((left, right) => left.localeCompare(right)),
    EXPIRY_DATE: [...stringBuckets.EXPIRY_DATE].sort((left, right) => left.localeCompare(right)),
  });
}
