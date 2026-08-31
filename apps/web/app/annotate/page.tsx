"use client";

import type {
  AnnotationAction,
  AnnotationAssistantProposal,
  AnnotationNormalizedValuesResponse,
  AnnotationQueueItem,
  AnnotationQueueType,
  AnnotationStats,
  DatasetPurpose,
  EntityAnnotation,
  EntityLabel,
  Intent,
  LoggedInterpretation,
  Relevance,
} from "@jangoing/contracts";
import {
  AnnotationNormalizedValues,
  AnnotationPhraseFamilies,
  AnnotationQueueTypeSchema,
  DatasetPurposeSchema,
} from "@jangoing/contracts";
import { Check, ChevronDown, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createAnnotation,
  createAnnotationAssistantProposal,
  getAnnotationNormalizedValues,
  getAnnotationQueue,
  getAnnotationStats,
  interpretCommand,
} from "../../lib/api";
import styles from "./page.module.css";

const intents: Intent[] = [
  "add_item",
  "update_expiry",
  "set_low_threshold",
  "consume_item",
  "mark_low",
  "mark_out",
  "throw_away",
  "add_to_buy",
  "query_inventory",
  "needs_clarification",
  "unknown",
];
const relevanceOptions: Array<{
  value: Relevance;
  label: string;
  description: string;
}> = [
  {
    value: "actionable",
    label: "Actionable",
    description: "Contains an action, query, state update, or request that needs clarification.",
  },
  {
    value: "contextual_preference",
    label: "Context or preference",
    description: "Useful preference, goal, or context with no immediate inventory action.",
  },
  {
    value: "domain_non_actionable",
    label: "Domain non-actionable",
    description: "Mentions groceries or cooking but does not request or report an action.",
  },
  {
    value: "unrelated",
    label: "Unrelated",
    description: "Outside the kitchen, grocery, preference, and household context.",
  },
];
const queueOptions: Array<{ type: AnnotationQueueType; label: string }> = [
  { type: "correction", label: "Load correction queue" },
  { type: "expiry", label: "Load expiry queue" },
  { type: "low_confidence", label: "Load low-confidence queue" },
  { type: "generated_review", label: "Load generated review" },
  { type: "preference_context", label: "Load preference/context" },
  { type: "domain_non_actionable", label: "Load domain non-actionable" },
  { type: "unrelated_negative", label: "Load unrelated negative" },
  { type: "confirmed_unannotated", label: "Load confirmed queue" },
  { type: "evaluation_holdout", label: "Load evaluation holdout" },
];
const queueStorageKey = "jangoing.annotation.queue-type";
const purposeStorageKey = "jangoing.annotation.dataset-purpose";
const labels: EntityLabel[] = [
  "ITEM",
  "CATEGORY",
  "QUANTITY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
];

const emptyStats: AnnotationStats = {
  annotated: 0,
  train_candidates: 0,
  evaluation_candidates: 0,
};

const normalizedValueRequiredLabels = new Set<EntityLabel>([
  "ITEM",
  "ITEM_CONDITION",
  "CATEGORY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
]);
const freeformNormalizedValueLabels = new Set<EntityLabel>([
  "ITEM",
  "ITEM_CONDITION",
  "CATEGORY",
  "UNIT",
]);

const lowerSnakeCasePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function readable(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readStoredPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Annotation remains usable when browser storage is unavailable.
  }
}

function actionsEqual(left: AnnotationAction[], right: AnnotationAction[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function missingNormalizedValueError(actions: AnnotationAction[]): string | null {
  for (const action of actions) {
    for (const entity of action.entities) {
      if (!normalizedValueRequiredLabels.has(entity.label)) {
        continue;
      }
      if (entity.label === "EXPIRY_DATE") {
        if (typeof entity.normalized_value !== "string" || entity.normalized_value.length === 0) {
          return `Add a normalized expiry date for "${entity.text}" before saving.`;
        }
        continue;
      }
      if (typeof entity.normalized_value !== "string" || entity.normalized_value.trim().length === 0) {
        return `Add a normalized value for ${readable(entity.label)} span "${entity.text}" before saving.`;
      }
    }
  }

  return null;
}

function initialNormalizedValueOptions(): AnnotationNormalizedValuesResponse {
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

function mergeNormalizedValueOptions(
  current: AnnotationNormalizedValuesResponse,
  actions: AnnotationAction[],
): AnnotationNormalizedValuesResponse {
  const stringBuckets = {
    ITEM: new Set(current.ITEM),
    ITEM_CONDITION: new Set(current.ITEM_CONDITION),
    CATEGORY: new Set(current.CATEGORY),
    UNIT: new Set(current.UNIT),
    LOCATION: new Set(current.LOCATION),
    EXPIRY_DATE: new Set(current.EXPIRY_DATE),
  };
  const quantityBucket = new Set(current.QUANTITY);

  for (const action of actions) {
    for (const entity of action.entities) {
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

  return {
    ITEM: [...stringBuckets.ITEM].sort((left, right) => left.localeCompare(right)),
    ITEM_CONDITION: [...stringBuckets.ITEM_CONDITION].sort((left, right) => left.localeCompare(right)),
    CATEGORY: [...stringBuckets.CATEGORY].sort((left, right) => left.localeCompare(right)),
    QUANTITY: [...quantityBucket].sort((left, right) => left - right),
    UNIT: [...stringBuckets.UNIT].sort((left, right) => left.localeCompare(right)),
    LOCATION: [...stringBuckets.LOCATION].sort((left, right) => left.localeCompare(right)),
    EXPIRY_DATE: [...stringBuckets.EXPIRY_DATE].sort((left, right) => left.localeCompare(right)),
  };
}

function mergeSingleNormalizedValueOption(
  current: AnnotationNormalizedValuesResponse,
  label: EntityLabel,
  value: string,
): AnnotationNormalizedValuesResponse {
  if (!value) {
    return current;
  }

  switch (label) {
    case "ITEM":
      return {
        ...current,
        ITEM: [...new Set([...current.ITEM, value])].sort((left, right) => left.localeCompare(right)),
      };
    case "ITEM_CONDITION":
      return {
        ...current,
        ITEM_CONDITION: [...new Set([...current.ITEM_CONDITION, value])]
          .sort((left, right) => left.localeCompare(right)),
      };
    case "CATEGORY":
      return {
        ...current,
        CATEGORY: [...new Set([...current.CATEGORY, value])].sort((left, right) => left.localeCompare(right)),
      };
    case "UNIT":
      return {
        ...current,
        UNIT: [...new Set([...current.UNIT, value])].sort((left, right) => left.localeCompare(right)),
      };
    default:
      return current;
  }
}

function canonicalizeFreeformNormalizedValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function freeformOptionsForLabel(
  label: EntityLabel,
  options: AnnotationNormalizedValuesResponse,
): string[] {
  switch (label) {
    case "ITEM":
      return options.ITEM;
    case "ITEM_CONDITION":
      return options.ITEM_CONDITION;
    case "CATEGORY":
      return options.CATEGORY;
    case "UNIT":
      return options.UNIT;
    default:
      return [];
  }
}

function normalizedValueFormatError(actions: AnnotationAction[]): string | null {
  for (const action of actions) {
    for (const entity of action.entities) {
      if (!freeformNormalizedValueLabels.has(entity.label) || typeof entity.normalized_value !== "string") {
        continue;
      }

      const value = entity.normalized_value.trim();
      if (!value) {
        continue;
      }

      if (!lowerSnakeCasePattern.test(value)) {
        const canonicalExample = canonicalizeFreeformNormalizedValue(value);
        return canonicalExample
          ? `Normalized value for ${readable(entity.label)} span "${entity.text}" should use lower_snake_case such as "${canonicalExample}".`
          : `Normalized value for ${readable(entity.label)} span "${entity.text}" should use lower_snake_case.`;
      }
    }
  }

  return null;
}

function trimSelectionEdges(text: string): {
  trimmedText: string;
  leadingWhitespace: number;
  trailingWhitespace: number;
} {
  const leadingWhitespace = text.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = text.match(/\s*$/)?.[0].length ?? 0;

  return {
    trimmedText: text.trim(),
    leadingWhitespace,
    trailingWhitespace,
  };
}

function suggestedExpiryDate(item: AnnotationQueueItem | null): string | null {
  if (!item || item.queue_type !== "expiry") {
    return null;
  }

  const groundedSuggestion = item.temporal_context.normalized_expiry_suggestion;
  if (groundedSuggestion) {
    return groundedSuggestion;
  }

  const reviewedExpiry = item.reviewed_interpretation?.slots.expiration_date;
  if (typeof reviewedExpiry === "string" && reviewedExpiry.length > 0) {
    return reviewedExpiry;
  }

  const predictedExpiry = item.predicted_interpretation.slots.expiration_date;
  if (typeof predictedExpiry === "string" && predictedExpiry.length > 0) {
    return predictedExpiry;
  }

  return null;
}

function formatInferenceTime(item: AnnotationQueueItem): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: item.temporal_context.timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(item.temporal_context.inference_created_at));
  } catch {
    return item.temporal_context.inference_created_at;
  }
}

function NormalizedValueControl({
  entity,
  options,
  listId,
  onChange,
  onSaveOption,
}: {
  entity: EntityAnnotation;
  options: AnnotationNormalizedValuesResponse;
  listId: string;
  onChange: (value: string | number | undefined) => void;
  onSaveOption: (label: EntityLabel, value: string, alreadyExists: boolean) => void;
}) {
  const [customEntryOpen, setCustomEntryOpen] = useState(false);

  useEffect(() => {
    setCustomEntryOpen(false);
  }, [entity.label, entity.start, entity.end]);

  if (entity.label === "EXPIRY_DATE") {
    return (
      <label className={styles.normalizedControl}>
        <span>Normalized value</span>
        <input
          aria-label={`Normalized value for ${entity.text}`}
          type="date"
          value={typeof entity.normalized_value === "string" ? entity.normalized_value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      </label>
    );
  }

  if (entity.label === "LOCATION") {
    return (
      <label className={styles.normalizedControl}>
        <span>Normalized value</span>
        <select
          aria-label={`Normalized value for ${entity.text}`}
          value={entity.normalized_value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Select a value</option>
          {AnnotationNormalizedValues.LOCATION.map((option) => (
            <option key={option} value={option}>{readable(String(option))}</option>
          ))}
        </select>
      </label>
    );
  }

  if (entity.label === "QUANTITY") {
    return (
      <label className={styles.normalizedControl}>
        <span>Normalized value</span>
        <input
          aria-label={`Normalized value for ${entity.text}`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          list={listId}
          value={
            entity.normalized_value === undefined
              ? ""
              : String(entity.normalized_value)
          }
          onChange={(event) => {
            if (!event.target.value) {
              onChange(undefined);
              return;
            }
            const nextValue = Number(event.target.value);
            onChange(Number.isFinite(nextValue) ? nextValue : undefined);
          }}
        />
        <datalist id={listId}>
          {options.QUANTITY.map((option) => (
            <option key={option} value={String(option)} />
          ))}
        </datalist>
      </label>
    );
  }

  const labelOptions = options[entity.label];
  const rawValue = typeof entity.normalized_value === "string" ? entity.normalized_value : "";
  const canonicalValue = canonicalizeFreeformNormalizedValue(rawValue);
  const freeformOptions = freeformOptionsForLabel(entity.label, options);
  const canSaveOption = freeformNormalizedValueLabels.has(entity.label) && canonicalValue.length > 0;
  const alreadyExists = canSaveOption && freeformOptions.includes(canonicalValue);
  const needsCanonicalRewrite = canSaveOption && rawValue.trim() !== canonicalValue;
  const hasExistingSelection = rawValue.length > 0 && freeformOptions.includes(rawValue);
  const showCustomEntry = customEntryOpen || (rawValue.length > 0 && !hasExistingSelection);

  return (
    <label className={styles.normalizedControl}>
      <span>Normalized value</span>
      <select
        aria-label={`Existing normalized value for ${entity.text}`}
        value={showCustomEntry ? "__new__" : rawValue}
        onChange={(event) => {
          if (event.target.value === "__new__") {
            setCustomEntryOpen(true);
            onChange(undefined);
            return;
          }
          setCustomEntryOpen(false);
          onChange(event.target.value || undefined);
        }}
      >
        <option value="">Select an existing value</option>
        {labelOptions.map((option) => (
          <option key={option} value={String(option)}>{readable(String(option))}</option>
        ))}
        <option value="__new__">+ Enter a new canonical value</option>
      </select>
      {showCustomEntry ? (
        <div className={styles.normalizedEntry}>
          <input
            aria-label={`New normalized value for ${entity.text}`}
            type="text"
            placeholder="new canonical value"
            value={rawValue}
            onChange={(event) => onChange(event.target.value || undefined)}
          />
          <button
            type="button"
            className={styles.inlineAction}
            disabled={!canSaveOption || (alreadyExists && !needsCanonicalRewrite)}
            onClick={() => {
              if (!canSaveOption) {
                return;
              }
              onChange(canonicalValue);
              onSaveOption(entity.label, canonicalValue, alreadyExists);
              setCustomEntryOpen(false);
            }}
          >
            {!canSaveOption
              ? "Save to list"
              : alreadyExists
              ? needsCanonicalRewrite
                ? `Use ${canonicalValue}`
                : "Saved"
              : `Save ${canonicalValue}`}
          </button>
        </div>
      ) : null}
      {freeformNormalizedValueLabels.has(entity.label) ? (
        <small className={styles.normalizedHint}>
          New canonical values should use lower_snake_case, for example <code>oat_milk</code>.
        </small>
      ) : null}
    </label>
  );
}

function annotationSegments(text: string, entities: EntityAnnotation[]) {
  const sorted = [...entities]
    .filter((entity) => entity.start >= 0 && entity.end <= text.length && entity.start < entity.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const segments: Array<{ text: string; entity: EntityAnnotation | null }> = [];
  let cursor = 0;

  for (const entity of sorted) {
    if (entity.start < cursor) continue;
    if (entity.start > cursor) {
      segments.push({ text: text.slice(cursor, entity.start), entity: null });
    }
    segments.push({ text: text.slice(entity.start, entity.end), entity });
    cursor = entity.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), entity: null });
  }
  return segments;
}

export default function AnnotatePage() {
  const textRef = useRef<HTMLDivElement>(null);
  const initialQueueLoadedRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [sample, setSample] = useState<LoggedInterpretation | null>(null);
  const [relevance, setRelevance] = useState<Relevance>("actionable");
  const [actions, setActions] = useState<AnnotationAction[]>([]);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [purpose, setPurpose] = useState<DatasetPurpose>("train_candidate");
  const [notes, setNotes] = useState("");
  const [queueItem, setQueueItem] = useState<AnnotationQueueItem | null>(null);
  const [selectedQueueType, setSelectedQueueType] = useState<AnnotationQueueType>("generated_review");
  const [stats, setStats] = useState<AnnotationStats>(emptyStats);
  const [normalizedOptions, setNormalizedOptions] = useState<AnnotationNormalizedValuesResponse>(
    initialNormalizedValueOptions(),
  );
  const [busy, setBusy] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantProposal, setAssistantProposal] = useState<AnnotationAssistantProposal | null>(null);
  const [queueSelectorOpen, setQueueSelectorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const expirySuggestion = suggestedExpiryDate(queueItem);
  const proposalUnchanged = assistantProposal ? actionsEqual(assistantProposal.actions, actions) : false;
  const activeEntities = actions[activeActionIndex]?.entities ?? [];

  useEffect(() => {
    void getAnnotationStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void getAnnotationNormalizedValues()
      .then(setNormalizedOptions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initialQueueLoadedRef.current) {
      return;
    }

    initialQueueLoadedRef.current = true;
    const storedQueue = AnnotationQueueTypeSchema.safeParse(
      readStoredPreference(queueStorageKey),
    );
    const storedPurpose = DatasetPurposeSchema.safeParse(
      readStoredPreference(purposeStorageKey),
    );
    const initialQueue = storedQueue.success ? storedQueue.data : "generated_review";
    setSelectedQueueType(initialQueue);
    if (storedPurpose.success) {
      setPurpose(storedPurpose.data);
    }
    void loadQueue(initialQueue);
  }, []);

  function resetEditorState() {
    setDraft("");
    setSample(null);
    setRelevance("actionable");
    setActions([]);
    setActiveActionIndex(0);
    setSelection(null);
    setNotes("");
    setQueueItem(null);
    setAssistantProposal(null);
  }

  function resetPageScroll() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function saveNormalizedOption(label: EntityLabel, value: string, alreadyExists: boolean) {
    if (!value) {
      setError("Enter a canonical normalized value before saving it to the list.");
      return;
    }

    setNormalizedOptions((current) => mergeSingleNormalizedValueOption(current, label, value));
    setError(null);
    setNotice(
      alreadyExists
        ? `Using existing canonical value ${value}.`
        : `Saved ${value} to the ${readable(label)} normalized value list for this session.`,
    );
  }

  async function createSample(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await interpretCommand(draft.trim());
      setSample(result);
      setRelevance("actionable");
      setActions([{ intent: result.intent, entities: [], phrase_family: null }]);
      setActiveActionIndex(0);
      setSelection(null);
      setQueueItem(null);
      setAssistantProposal(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create sample.");
    } finally {
      setBusy(false);
    }
  }

  function loadQueueSample(item: AnnotationQueueItem) {
    setSample({
      ...item.predicted_interpretation,
      inference_id: item.inference_id,
      parser_version: item.parser_version,
      latency_ms: 0,
    });
    setRelevance(item.suggested_relevance ?? "actionable");
    setActions([{
      intent: item.reviewed_interpretation?.intent ?? item.predicted_interpretation.intent,
      entities: [],
      phrase_family: null,
    }]);
    setActiveActionIndex(0);
    setSelection(null);
    setNotes("");
    setDraft(item.text);
    setQueueItem(item);
    setAssistantProposal(null);
  }

  function selectPurpose(nextPurpose: DatasetPurpose) {
    setPurpose(nextPurpose);
    storePreference(purposeStorageKey, nextPurpose);
  }

  function selectRelevance(nextRelevance: Relevance) {
    setRelevance(nextRelevance);
    setSelection(null);
    setError(null);
    window.getSelection()?.removeAllRanges();

    if (nextRelevance !== "actionable") {
      setAssistantProposal(null);
      setActiveActionIndex(0);
      return;
    }

    if (actions.length === 0 && sample) {
      setActions([{ intent: sample.intent, entities: [], phrase_family: null }]);
    }
  }

  async function loadQueue(type: AnnotationQueueType) {
    setSelectedQueueType(type);
    storePreference(queueStorageKey, type);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const [item] = await getAnnotationQueue(type, 1);
      if (!item) {
        setNotice(`No items are waiting in the ${readable(type)} queue.`);
        return;
      }
      loadQueueSample(item);
      const correctedIntent = item.reviewed_interpretation?.intent;
      setNotice(
        type === "evaluation_holdout"
          ? "Loaded a reviewed holdout example. Your current dataset purpose selection was preserved."
          : type === "generated_review"
          ? "Loaded a pregenerated review example. Use it to broaden coverage, but treat the reference intent as a starting point rather than final truth."
          : type === "preference_context"
          ? "Loaded a generated context or preference candidate. Confirm its relevance; the preselection is not ground truth."
          : type === "domain_non_actionable"
          ? "Loaded a generated grocery-domain non-actionable candidate. Confirm that it contains no immediate action."
          : type === "unrelated_negative"
          ? "Loaded a generated unrelated negative candidate. Keep this class smaller than domain-adjacent negatives."
          : type === "expiry"
          ? "Loaded an expiry-focused example. Mark the date span, then apply the parsed expiry date if it looks correct."
          : correctedIntent
          ? `Loaded a corrected example. Parser predicted ${readable(item.predicted_interpretation.intent)} and the saved correction prefilled ${readable(correctedIntent)}.`
          : `Loaded an item from the ${readable(type)} queue.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not load the ${type} queue.`);
    } finally {
      setBusy(false);
    }
  }

  async function loadNextQueueSampleAfterSave(type: AnnotationQueueType): Promise<boolean> {
    const [item] = await getAnnotationQueue(type, 1);
    if (!item) {
      return false;
    }

    loadQueueSample(item);
    return true;
  }

  function captureSelection() {
    const root = textRef.current;
    const browserSelection = window.getSelection();
    if (!root || !browserSelection || browserSelection.rangeCount === 0) return;
    const range = browserSelection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const text = range.toString();
    const { trimmedText, leadingWhitespace, trailingWhitespace } = trimSelectionEdges(text);
    if (!trimmedText) return;
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length + leadingWhitespace;
    const end = start + text.length - leadingWhitespace - trailingWhitespace;
    setSelection({ start, end, text: trimmedText });
  }

  useEffect(() => {
    let frame: number | null = null;

    function captureChangedSelection() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(captureSelection);
    }

    document.addEventListener("selectionchange", captureChangedSelection);
    return () => {
      document.removeEventListener("selectionchange", captureChangedSelection);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  function addEntity(label: EntityLabel) {
    if (!selection) return;
    const activeEntities = actions[activeActionIndex]?.entities ?? [];
    const overlaps = activeEntities.some(
      (entity) => entity.start < selection.end && selection.start < entity.end,
    );
    if (overlaps) {
      setError("Entity spans cannot overlap. Remove the existing label first.");
      return;
    }
    setActions((current) => current.map((action, index) => index === activeActionIndex
      ? { ...action, entities: [{ label, ...selection }, ...action.entities] }
      : action));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setError(null);
  }

  function applySuggestedExpiryDate() {
    if (!expirySuggestion) {
      setError("No parsed expiry date is available for this queue item.");
      return;
    }

    const activeEntities = actions[activeActionIndex]?.entities ?? [];
    const hasExpiryEntity = activeEntities.some((entity) => entity.label === "EXPIRY_DATE");
    if (!hasExpiryEntity) {
      setError("Add an EXPIRY_DATE span to the active action before applying the parsed date.");
      return;
    }

    setActions((current) => current.map((action, index) =>
      index === activeActionIndex
        ? {
            ...action,
            entities: action.entities.map((entity) =>
              entity.label === "EXPIRY_DATE"
                ? { ...entity, normalized_value: expirySuggestion }
                : entity),
          }
        : action));
    setError(null);
    setNotice(`Applied parsed expiry date ${expirySuggestion} to EXPIRY_DATE span(s) in Action ${activeActionIndex + 1}.`);
  }

  async function draftWithAssistant() {
    if (!sample) return;
    setAssistantBusy(true);
    setError(null);
    try {
      const proposal = await createAnnotationAssistantProposal(sample.inference_id);
      setAssistantProposal(proposal);
      setActions(proposal.actions.map((action) => ({
        ...action,
        entities: action.entities.map((entity) => ({ ...entity })),
      })));
      setActiveActionIndex(0);
      setSelection(null);
      setNotice(
        proposal.provider === "parser-fallback"
          ? "The annotation draft used the deterministic parser fallback and is ready for review."
          : `AI draft applied from ${proposal.provider}:${proposal.model}. Review and edit it before saving.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate an annotation draft.");
    } finally {
      setAssistantBusy(false);
    }
  }

  async function saveAnnotation() {
    if (!sample) return;
    const nextQueueType = selectedQueueType;
    const submittedActions = relevance === "actionable" ? actions : [];
    const validationError = missingNormalizedValueError(submittedActions);
    if (validationError) {
      setError(validationError);
      return;
    }
    const formatError = normalizedValueFormatError(submittedActions);
    if (formatError) {
      setError(formatError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAnnotation({
        inference_id: sample.inference_id,
        relevance,
        actions: submittedActions,
        dataset_purpose: purpose,
        notes: notes.trim() || null,
        annotator: "production-web",
        ...(assistantProposal
          ? {
              assistant_proposal_id: assistantProposal.proposal_id,
              assistant_resolution: proposalUnchanged ? "accepted_as_is" : "accepted_with_edits",
            }
          : {}),
      });
      setNormalizedOptions((current) => mergeNormalizedValueOptions(current, submittedActions));
      setStats((current) => ({
        ...current,
        annotated: current.annotated + 1,
        train_candidates: current.train_candidates + (purpose === "train_candidate" ? 1 : 0),
        evaluation_candidates: current.evaluation_candidates + (purpose === "evaluation_candidate" ? 1 : 0),
      }));
      const loadedNext = await loadNextQueueSampleAfterSave(nextQueueType);
      resetPageScroll();
      if (loadedNext) {
        setNotice(
          `Annotation saved. Loaded the next ${readable(nextQueueType)} sample, and new normalized values from this review are now reusable.`,
        );
      } else {
        resetEditorState();
        setNotice(
          `Annotation saved. No more items are waiting in the ${readable(nextQueueType)} queue right now.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save annotation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.intro}>
        <p>DATA COLLECTION</p>
        <h1>Label one real sentence at a time.</h1>
        <span>Enter a natural English sentence, correct its intent, then select exact text spans for entities.</span>
      </section>

      <section className={styles.progressPanel} aria-label="Annotation collection progress">
        <article>
          <div><span>TRAINING CANDIDATES</span><b>{stats.train_candidates}<small> / 100–200</small></b></div>
          <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, stats.train_candidates)}%` }} /></div>
          <p>{stats.train_candidates >= 100 ? "Initial target reached" : `${100 - stats.train_candidates} until the initial target`}</p>
        </article>
        <article>
          <div><span>EVALUATION CANDIDATES</span><b>{stats.evaluation_candidates}<small> / 100+</small></b></div>
          <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, stats.evaluation_candidates)}%` }} /></div>
          <p>{stats.evaluation_candidates >= 100 ? "Initial target reached" : `${100 - stats.evaluation_candidates} until the initial target`}</p>
        </article>
      </section>

      <div className={styles.workspace}>
        <section className={styles.card}>
          <div className={styles.step}><span>1</span><div><b>Create a sample</b><small>Write it as you would actually say it.</small></div></div>
          <section className={styles.queueSelector}>
            <button
              type="button"
              className={styles.queueToggle}
              aria-expanded={queueSelectorOpen}
              aria-controls="annotation-queue-options"
              onClick={() => setQueueSelectorOpen((current) => !current)}
            >
              <span><b>Queue selector</b><small>Last queue: {readable(selectedQueueType)}</small></span>
              <ChevronDown className={queueSelectorOpen ? styles.queueChevronOpen : ""} size={18} />
            </button>
            {queueSelectorOpen ? <div id="annotation-queue-options" className={styles.queueActions}>
              <div className={styles.queueButtons}>
              {queueOptions.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  className={`${styles.secondaryButton} ${
                    selectedQueueType === option.type ? styles.selectedQueueButton : ""
                  }`}
                  disabled={busy}
                  aria-pressed={selectedQueueType === option.type}
                  onClick={() => void loadQueue(option.type)}
                >
                  {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />}
                  {option.label}
                </button>
              ))}
              </div>
              <p>Review actionable coverage, production corrections, or generated relevance candidates. Candidate relevance is only a preselection and must be confirmed by the annotator.</p>
            </div> : null}
          </section>
          <form onSubmit={createSample} className={styles.sampleForm}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="I was going to make cereal, but it looks like we're almost out of milk." />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Create
            </button>
          </form>
          <p className={styles.inputHint}>Enter to create · Shift + Enter for a new line</p>
          {notice && <p className={styles.notice}>{notice}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {sample ? (
          <>
            <section className={styles.card}>
              <div className={styles.step}>
                <span>2</span>
                <div>
                  <b>Classify relevance</b>
                  <small>Decide whether this utterance contains an immediate action before labeling its structure.</small>
                </div>
              </div>
              <div className={styles.relevanceGrid}>
                {relevanceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={relevance === option.value}
                    className={relevance === option.value ? styles.activeRelevance : ""}
                    onClick={() => selectRelevance(option.value)}
                  >
                    <b>{option.label}</b>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              <p className={styles.prediction}>
                Parser prediction: <b>{readable(sample.intent)}</b> · {Math.round(sample.confidence * 100)}%
                {queueItem ? <span className={styles.queueSource}>{readable(queueItem.queue_type)} queue</span> : null}
              </p>
              {queueItem?.queue_type === "expiry" ? (
                <aside className={styles.temporalContext}>
                  <b>Temporal context</b>
                  <dl>
                    <div><dt>Reference date</dt><dd>{queueItem.temporal_context.reference_date}</dd></div>
                    <div><dt>Timezone</dt><dd>{queueItem.temporal_context.timezone}</dd></div>
                    <div><dt>Original inference</dt><dd>{formatInferenceTime(queueItem)}</dd></div>
                    <div>
                      <dt>Normalized suggestion</dt>
                      <dd>{queueItem.temporal_context.normalized_expiry_suggestion ?? "Not available"}</dd>
                    </div>
                  </dl>
                </aside>
              ) : null}
            </section>

            {relevance === "actionable" ? (
              <>
            <section className={`${styles.card} ${styles.assistantPanel}`}>
              <div className={styles.assistantHeader}>
                <div>
                  <b>Assistant draft</b>
                  <span>Generate labels, then scroll down to review and edit the applied result.</span>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || assistantBusy}
                  onClick={() => void draftWithAssistant()}
                >
                  {assistantBusy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />}
                  Draft with AI
                </button>
              </div>
              {assistantProposal ? (
                <div className={styles.assistantBody}>
                  <p>
                    <b>{assistantProposal.provider}</b> · {assistantProposal.model} · {assistantProposal.prompt_version}
                  </p>
                  <p>{assistantProposal.actions.length} proposed action{assistantProposal.actions.length === 1 ? "" : "s"}.</p>
                  {assistantProposal.note ? <p>{assistantProposal.note}</p> : null}
                  <div className={styles.assistantLabels}>
                    {assistantProposal.actions.map((action, actionIndex) => (
                      <section key={`${action.intent}-${actionIndex}`}>
                        <b>Action {actionIndex + 1}: {readable(action.intent)}</b>
                        {action.entities.length > 0 ? (
                          <ul>
                            {action.entities.map((entity) => (
                              <li key={`${entity.label}-${entity.start}-${entity.end}`}>
                                <code>{entity.label}</code> “{entity.text}”
                                {entity.normalized_value !== undefined
                                  ? ` → ${String(entity.normalized_value)}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        ) : <span>No entity spans proposed.</span>}
                      </section>
                    ))}
                  </div>
                  <p>
                    {proposalUnchanged
                      ? "The applied draft is unchanged. Review it, then save when it is correct."
                      : "The applied draft has edits and will be saved as edited."}
                  </p>
                </div>
              ) : (
                <p className={styles.assistantEmpty}>Generate a draft for this sample, then review the applied actions and labels below.</p>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>3</span><div><b>Define the actions</b><small>Add one action for each request, then select the action you want to label.</small></div></div>
              <div className={styles.actionList}>
                {actions.map((action, actionIndex) => (
                  <div key={actionIndex} className={activeActionIndex === actionIndex ? styles.activeAction : ""}>
                    <button className={styles.actionSelector} type="button" onClick={() => setActiveActionIndex(actionIndex)}>
                      <b>Action {actionIndex + 1}</b><span>{action.entities.length} entities</span>
                    </button>
                    <label><span>Intent</span><select value={action.intent} onChange={(event) => {
                      const nextIntent = event.target.value as Intent;
                      setActions((current) => current.map((item, index) => index === actionIndex
                        ? { ...item, intent: nextIntent, phrase_family: null }
                        : item));
                    }}>{intents.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
                    <label><span>Phrase family <small>optional</small></span><select value={action.phrase_family ?? ""} onChange={(event) => {
                      setActions((current) => current.map((item, index) => index === actionIndex
                        ? { ...item, phrase_family: event.target.value || null }
                        : item));
                    }}><option value="">Select a family</option>{AnnotationPhraseFamilies[action.intent].map((family) => (
                      <option key={family} value={family}>{readable(family)}</option>
                    ))}</select></label>
                    <button className={styles.removeAction} type="button" disabled={actions.length === 1}
                      aria-label={`Remove action ${actionIndex + 1}`} onClick={() => {
                        setActions((current) => current.filter((_, index) => index !== actionIndex));
                        setActiveActionIndex((current) => Math.max(0, current > actionIndex ? current - 1 : Math.min(current, actions.length - 2)));
                      }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <button className={styles.addAction} type="button" disabled={actions.length >= 8} onClick={() => {
                setActions((current) => [...current, { intent: "unknown", entities: [], phrase_family: null }]);
                setActiveActionIndex(actions.length);
                setSelection(null);
              }}><Plus size={16} /> Add action</button>
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>4</span><div><b>Label entity spans for Action {activeActionIndex + 1}</b><small>Select an action above, select exact words below, then choose a label.</small></div></div>
              <div
                ref={textRef}
                onMouseUp={captureSelection}
                onTouchEnd={() => window.setTimeout(captureSelection, 50)}
                className={styles.annotationText}
              >
                {annotationSegments(sample.raw_utterance, activeEntities).map((segment, index) =>
                  segment.entity ? (
                    <mark
                      key={`${segment.entity.start}-${segment.entity.end}-${segment.entity.label}`}
                      className={styles.entityHighlight}
                      data-label={segment.entity.label}
                    >
                      {segment.text}
                    </mark>
                  ) : <span key={`plain-${index}`}>{segment.text}</span>)}
              </div>
              <div className={styles.labelBar}>
                {labels.map((label) => <button type="button" key={label} disabled={!selection} onClick={() => addEntity(label)}>{label}</button>)}
              </div>
              {expirySuggestion ? (
                <p className={styles.inputHint}>
                  Expiry queue helper: stored temporal context suggests <code>{expirySuggestion}</code>.{" "}
                  <button type="button" className={styles.secondaryButton} onClick={applySuggestedExpiryDate}>
                    Apply parsed expiry date
                  </button>
                </p>
              ) : null}
              {selection && <p className={styles.selection}>Selected: “{selection.text}” [{selection.start}, {selection.end}]</p>}
              <div className={styles.entityList}>
                {actions.map((action, actionIndex) => (
                  <section key={actionIndex} className={activeActionIndex === actionIndex ? styles.activeEntityGroup : ""}>
                    <header><b>Action {actionIndex + 1}</b><span>{readable(action.intent)}</span></header>
                    {action.entities.map((entity, entityIndex) => (
                      <div key={`${entity.start}-${entity.end}-${entity.label}`}>
                        <code>{entity.label}</code><span>“{entity.text}”</span><small>{entity.start}:{entity.end}</small>
                        <NormalizedValueControl entity={entity}
                          options={normalizedOptions}
                          listId={`normalized-${actionIndex}-${entityIndex}-${entity.label}`}
                          onSaveOption={saveNormalizedOption}
                          onChange={(value) => setActions((current) => current.map((item, itemIndex) =>
                            itemIndex === actionIndex ? { ...item, entities: item.entities.map((existing, index) =>
                              index === entityIndex ? { ...existing, normalized_value: value } : existing) } : item))} />
                        <button type="button" aria-label="Remove entity" onClick={() => setActions((current) => current.map((item, itemIndex) =>
                          itemIndex === actionIndex ? { ...item, entities: item.entities.filter((_, index) => index !== entityIndex) } : item))}><Trash2 size={16} /></button>
                      </div>
                    ))}
                    {action.entities.length === 0 && <p>No entity spans for this action.</p>}
                  </section>
                ))}
              </div>
            </section>
              </>
            ) : null}

            <section className={styles.card}>
              <div className={styles.step}><span>{relevance === "actionable" ? "5" : "3"}</span><div><b>Dataset metadata</b><small>Evaluation candidates should be natural, independent examples—not rewritten training templates.</small></div></div>
              <div className={styles.metaGrid}>
                <label><span>Purpose</span><select value={purpose} onChange={(event) => selectPurpose(event.target.value as DatasetPurpose)}>
                  <option value="train_candidate">Training candidate</option><option value="evaluation_candidate">Evaluation candidate</option>
                </select></label>
                <label className={styles.full}><span>Notes <small>optional</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ambiguity or labeling rationale" /></label>
              </div>
              <button
                className={styles.save}
                type="button"
                onClick={() => void saveAnnotation()}
                disabled={busy}
              >
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Check size={18} />} Save annotation
              </button>
            </section>
          </>
        ) : (
          <section className={styles.empty}><span>01</span><p>Create a sentence above to begin annotation.</p></section>
        )}
      </div>
    </main>
  );
}
