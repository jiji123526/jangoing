"use client";

import type {
  AnnotationAction,
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
  getAnnotationQueue,
  getAnnotationStats,
  interpretCommand,
} from "../../lib/api";
import styles from "./page.module.css";

const intents: Intent[] = [
  "add_item",
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

function readable(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function NormalizedValueControl({
  entity,
  onChange,
}: {
  entity: EntityAnnotation;
  onChange: (value: string | number | undefined) => void;
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

  const options = AnnotationNormalizedValues[entity.label];
  return (
    <label className={styles.normalizedControl}>
      <span>Normalized value</span>
      <select
        aria-label={`Normalized value for ${entity.text}`}
        value={entity.normalized_value ?? ""}
        onChange={(event) => {
          if (!event.target.value) {
            onChange(undefined);
            return;
          }
          onChange(entity.label === "QUANTITY" ? Number(event.target.value) : event.target.value);
        }}
      >
        <option value="">Select a value</option>
        {options.map((option) => (
          <option key={option} value={option}>{readable(String(option))}</option>
        ))}
      </select>
    </label>
  );
}

export default function AnnotatePage() {
  const textRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sample, setSample] = useState<LoggedInterpretation | null>(null);
  const [actions, setActions] = useState<AnnotationAction[]>([]);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [purpose, setPurpose] = useState<DatasetPurpose>("train_candidate");
  const [notes, setNotes] = useState("");
  const [queueItem, setQueueItem] = useState<AnnotationQueueItem | null>(null);
  const [stats, setStats] = useState<AnnotationStats>(emptyStats);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getAnnotationStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

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
    setPurpose("train_candidate");
    setNotes("");
    setDraft(item.text);
    setQueueItem(item);
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
        correctedIntent
          ? `Loaded a corrected example. Parser predicted ${readable(item.predicted_interpretation.intent)} and the saved correction prefilled ${readable(correctedIntent)}.`
          : `Loaded an item from the ${readable(type)} queue.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not load the ${type} queue.`);
    } finally {
      setBusy(false);
    }
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

  async function saveAnnotation() {
    if (!sample) return;
    setBusy(true);
    setError(null);
    try {
      await createAnnotation({
        inference_id: sample.inference_id,
        actions,
        dataset_purpose: purpose,
        notes: notes.trim() || null,
        annotator: "production-web",
      });
      setStats((current) => ({
        ...current,
        annotated: current.annotated + 1,
        train_candidates: current.train_candidates + (purpose === "train_candidate" ? 1 : 0),
        evaluation_candidates: current.evaluation_candidates + (purpose === "evaluation_candidate" ? 1 : 0),
      }));
      setNotice("Annotation saved. Enter the next sentence.");
      setDraft("");
      setSample(null);
      setActions([]);
      setActiveActionIndex(0);
      setSelection(null);
      setNotes("");
      setQueueItem(null);
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
            </div>
            <p>Start with corrected examples, expiry-heavy sentences, or low-confidence predictions.</p>
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
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>3</span><div><b>Label entity spans for Action {activeActionIndex + 1}</b><small>Select an action above, select exact words below, then choose a label.</small></div></div>
              <div ref={textRef} onMouseUp={captureSelection} className={styles.annotationText}>{sample.raw_utterance}</div>
              <div className={styles.labelBar}>
                {labels.map((label) => <button type="button" key={label} disabled={!selection} onClick={() => addEntity(label)}>{label}</button>)}
              </div>
              {selection && <p className={styles.selection}>Selected: “{selection.text}” [{selection.start}, {selection.end}]</p>}
              <div className={styles.entityList}>
                {actions.map((action, actionIndex) => (
                  <section key={actionIndex} className={activeActionIndex === actionIndex ? styles.activeEntityGroup : ""}>
                    <header><b>Action {actionIndex + 1}</b><span>{readable(action.intent)}</span></header>
                    {action.entities.map((entity, entityIndex) => (
                      <div key={`${entity.start}-${entity.end}-${entity.label}`}>
                        <code>{entity.label}</code><span>“{entity.text}”</span><small>{entity.start}:{entity.end}</small>
                        <NormalizedValueControl entity={entity}
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
              <button className={styles.save} type="button" onClick={() => void saveAnnotation()} disabled={busy}>
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
