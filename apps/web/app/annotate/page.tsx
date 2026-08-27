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
} from "@jangoing/contracts";
import {
  AnnotationNormalizedValues,
  AnnotationPhraseFamilies,
} from "@jangoing/contracts";
import { ArrowLeft, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
  "consume_item",
  "mark_low",
  "throw_away",
  "add_to_buy",
  "query_inventory",
  "needs_clarification",
  "unknown",
];
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
  "CATEGORY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
]);
const freeformNormalizedValueLabels = new Set<EntityLabel>([
  "ITEM",
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
      if (entity.label === "CATEGORY") stringBuckets.CATEGORY.add(normalizedValue);
      if (entity.label === "UNIT") stringBuckets.UNIT.add(normalizedValue);
      if (entity.label === "LOCATION") stringBuckets.LOCATION.add(normalizedValue);
      if (entity.label === "EXPIRY_DATE") stringBuckets.EXPIRY_DATE.add(normalizedValue);
    }
  }

  return {
    ITEM: [...stringBuckets.ITEM].sort((left, right) => left.localeCompare(right)),
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

function suggestedExpiryDate(item: AnnotationQueueItem | null): string | null {
  if (!item || item.queue_type !== "expiry") {
    return null;
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

  return (
    <label className={styles.normalizedControl}>
      <span>Normalized value</span>
      <div className={styles.normalizedEntry}>
        <input
          aria-label={`Normalized value for ${entity.text}`}
          type="text"
          list={listId}
          placeholder={
            freeformNormalizedValueLabels.has(entity.label)
              ? "search existing or enter a new canonical value"
              : "normalized value"
          }
          value={rawValue}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
        {freeformNormalizedValueLabels.has(entity.label) ? (
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
        ) : null}
      </div>
      <datalist id={listId}>
        {labelOptions.map((option) => (
          <option key={option} value={String(option)} />
        ))}
      </datalist>
      {freeformNormalizedValueLabels.has(entity.label) ? (
        <small className={styles.normalizedHint}>
          New canonical values should use lower_snake_case, for example <code>oat_milk</code>.
        </small>
      ) : null}
    </label>
  );
}

export default function AnnotatePage() {
  const textRef = useRef<HTMLDivElement>(null);
  const initialGeneratedQueueLoadedRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [sample, setSample] = useState<LoggedInterpretation | null>(null);
  const [actions, setActions] = useState<AnnotationAction[]>([]);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [purpose, setPurpose] = useState<DatasetPurpose>("train_candidate");
  const [notes, setNotes] = useState("");
  const [queueItem, setQueueItem] = useState<AnnotationQueueItem | null>(null);
  const [stats, setStats] = useState<AnnotationStats>(emptyStats);
  const [normalizedOptions, setNormalizedOptions] = useState<AnnotationNormalizedValuesResponse>(
    initialNormalizedValueOptions(),
  );
  const [busy, setBusy] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantProposal, setAssistantProposal] = useState<AnnotationAssistantProposal | null>(null);
  const [assistantApplied, setAssistantApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const expirySuggestion = suggestedExpiryDate(queueItem);
  const proposalUnchanged = assistantProposal ? actionsEqual(assistantProposal.actions, actions) : false;

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
    if (initialGeneratedQueueLoadedRef.current) {
      return;
    }

    initialGeneratedQueueLoadedRef.current = true;
    void loadQueue("generated_review");
  }, []);

  function resetEditorState() {
    setDraft("");
    setSample(null);
    setActions([]);
    setActiveActionIndex(0);
    setSelection(null);
    setNotes("");
    setQueueItem(null);
    setAssistantProposal(null);
    setAssistantApplied(false);
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
      setActions([{ intent: result.intent, entities: [], phrase_family: null }]);
      setActiveActionIndex(0);
      setSelection(null);
      setQueueItem(null);
      setAssistantProposal(null);
      setAssistantApplied(false);
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
    setActions([{
      intent: item.reviewed_interpretation?.intent ?? item.predicted_interpretation.intent,
      entities: [],
      phrase_family: null,
    }]);
    setActiveActionIndex(0);
    setSelection(null);
    setPurpose(item.queue_type === "evaluation_holdout" ? "evaluation_candidate" : "train_candidate");
    setNotes("");
    setDraft(item.text);
    setQueueItem(item);
    setAssistantProposal(null);
    setAssistantApplied(false);
  }

  async function loadQueue(type: AnnotationQueueType) {
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
          ? "Loaded a reviewed holdout example and preselected it as an evaluation candidate."
          : type === "generated_review"
          ? "Loaded a pregenerated review example. Use it to broaden coverage, but treat the reference intent as a starting point rather than final truth."
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
    if (!text.trim()) return;
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    setSelection({ start, end: start + text.length, text });
  }

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
      ? { ...action, entities: [...action.entities, { label, ...selection }].sort((a, b) => a.start - b.start) }
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
      setAssistantApplied(false);
      setNotice(
        proposal.provider === "parser-fallback"
          ? "AI key is not configured, so the annotation draft fell back to the deterministic parser baseline."
          : `AI draft ready from ${proposal.provider}:${proposal.model}. Review it before applying.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate an annotation draft.");
    } finally {
      setAssistantBusy(false);
    }
  }

  function applyAssistantDraft() {
    if (!assistantProposal) {
      setError("Generate an assistant draft before applying it.");
      return;
    }

    setActions(assistantProposal.actions.map((action) => ({
      ...action,
      entities: action.entities.map((entity) => ({ ...entity })),
    })));
    setActiveActionIndex(0);
    setSelection(null);
    setAssistantApplied(true);
    setError(null);
    setNotice("Applied the assistant draft. Edit anything that looks off before saving.");
  }

  async function saveAnnotation() {
    if (!sample) return;
    const nextQueueType: AnnotationQueueType = queueItem?.queue_type ?? "generated_review";
    const validationError = missingNormalizedValueError(actions);
    if (validationError) {
      setError(validationError);
      return;
    }
    const formatError = normalizedValueFormatError(actions);
    if (formatError) {
      setError(formatError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAnnotation({
        inference_id: sample.inference_id,
        actions,
        dataset_purpose: purpose,
        notes: notes.trim() || null,
        annotator: "production-web",
        ...(assistantProposal && assistantApplied
          ? {
              assistant_proposal_id: assistantProposal.proposal_id,
              assistant_resolution: proposalUnchanged ? "accepted_as_is" : "accepted_with_edits",
            }
          : {}),
      });
      setNormalizedOptions((current) => mergeNormalizedValueOptions(current, actions));
      setStats((current) => ({
        ...current,
        annotated: current.annotated + 1,
        train_candidates: current.train_candidates + (purpose === "train_candidate" ? 1 : 0),
        evaluation_candidates: current.evaluation_candidates + (purpose === "evaluation_candidate" ? 1 : 0),
      }));
      const loadedNext = await loadNextQueueSampleAfterSave(nextQueueType);
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
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}><ArrowLeft size={17} /> Kitchen</Link>
          <strong>Annotation workspace</strong>
        </div>
        <span><b>{stats.annotated}</b> saved</span>
      </header>

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
          <div className={styles.queueActions}>
            <div className={styles.queueButtons}>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("correction")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load correction queue
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("expiry")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load expiry queue
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("low_confidence")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load low-confidence queue
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("generated_review")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load generated review
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("confirmed_unannotated")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load confirmed queue
              </button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void loadQueue("evaluation_holdout")}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Load evaluation holdout
              </button>
            </div>
            <p>Start with corrected examples, expiry-heavy sentences, low-confidence predictions, pregenerated coverage samples, confirmed production samples, or a deterministic evaluation slice.</p>
          </div>
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
              <div className={styles.step}><span>2</span><div><b>Define the actions</b><small>Add one action for each request, then select the action you want to label.</small></div></div>
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
              <p className={styles.prediction}>
                Parser prediction: <b>{readable(sample.intent)}</b> · {Math.round(sample.confidence * 100)}%
                {queueItem ? <span className={styles.queueSource}>{readable(queueItem.queue_type)} queue</span> : null}
              </p>
              <div className={styles.assistantPanel}>
                <div className={styles.assistantHeader}>
                  <div>
                    <b>Assistant draft</b>
                    <span>Use AI or parser fallback as a starting point. Human review is still the ground truth.</span>
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
                    <p>
                      {assistantApplied
                        ? proposalUnchanged
                          ? "Current annotation still matches the applied draft."
                          : "Current annotation differs from the applied draft and will be saved as edited."
                        : "Draft generated but not applied yet."}
                    </p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy || assistantBusy}
                      onClick={applyAssistantDraft}
                    >
                      Apply AI draft
                    </button>
                  </div>
                ) : (
                  <p className={styles.assistantEmpty}>Generate a draft after loading or creating a sample.</p>
                )}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>3</span><div><b>Label entity spans for Action {activeActionIndex + 1}</b><small>Select an action above, select exact words below, then choose a label.</small></div></div>
              <div ref={textRef} onMouseUp={captureSelection} className={styles.annotationText}>{sample.raw_utterance}</div>
              <div className={styles.labelBar}>
                {labels.map((label) => <button type="button" key={label} disabled={!selection} onClick={() => addEntity(label)}>{label}</button>)}
              </div>
              {expirySuggestion ? (
                <p className={styles.inputHint}>
                  Expiry queue helper: parser suggested <code>{expirySuggestion}</code>.{" "}
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

            <section className={styles.card}>
              <div className={styles.step}><span>4</span><div><b>Dataset metadata</b><small>Evaluation candidates should be natural, independent examples—not rewritten training templates.</small></div></div>
              <div className={styles.metaGrid}>
                <label><span>Purpose</span><select value={purpose} onChange={(event) => setPurpose(event.target.value as DatasetPurpose)}>
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
