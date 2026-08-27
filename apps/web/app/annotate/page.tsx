"use client";

import type {
  DatasetPurpose,
  EntityAnnotation,
  EntityLabel,
  Intent,
  LoggedInterpretation,
} from "@jangoing/contracts";
import { AnnotationNormalizedValues } from "@jangoing/contracts";
import { ArrowLeft, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createAnnotation,
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
  const [intent, setIntent] = useState<Intent>("unknown");
  const [entities, setEntities] = useState<EntityAnnotation[]>([]);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [purpose, setPurpose] = useState<DatasetPurpose>("train_candidate");
  const [phraseFamily, setPhraseFamily] = useState("");
  const [notes, setNotes] = useState("");
  const [annotated, setAnnotated] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getAnnotationStats()
      .then((stats) => setAnnotated(stats.annotated))
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
      setIntent(result.intent);
      setEntities([]);
      setSelection(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create sample.");
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
    const overlaps = entities.some(
      (entity) => entity.start < selection.end && selection.start < entity.end,
    );
    if (overlaps) {
      setError("Entity spans cannot overlap. Remove the existing label first.");
      return;
    }
    setEntities((current) =>
      [...current, { label, ...selection }].sort((a, b) => a.start - b.start),
    );
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
        intent,
        entities,
        dataset_purpose: purpose,
        phrase_family: phraseFamily.trim() || null,
        notes: notes.trim() || null,
        annotator: "production-web",
      });
      setAnnotated((count) => count + 1);
      setNotice("Annotation saved. Enter the next sentence.");
      setDraft("");
      setSample(null);
      setEntities([]);
      setSelection(null);
      setPhraseFamily("");
      setNotes("");
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
        <span><b>{annotated}</b> saved</span>
      </header>

      <section className={styles.intro}>
        <p>DATA COLLECTION</p>
        <h1>Label one real sentence at a time.</h1>
        <span>Enter a natural English sentence, correct its intent, then select exact text spans for entities.</span>
      </section>

      <div className={styles.workspace}>
        <section className={styles.card}>
          <div className={styles.step}><span>1</span><div><b>Create a sample</b><small>Write it as you would actually say it.</small></div></div>
          <form onSubmit={createSample} className={styles.sampleForm}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500}
              placeholder="I was going to make cereal, but it looks like we're almost out of milk." />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />} Create
            </button>
          </form>
          {notice && <p className={styles.notice}>{notice}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {sample ? (
          <>
            <section className={styles.card}>
              <div className={styles.step}><span>2</span><div><b>Choose the intent</b><small>Use clarification when the request is relevant but unsafe to resolve.</small></div></div>
              <div className={styles.intentGrid}>
                {intents.map((value) => (
                  <button key={value} type="button" onClick={() => setIntent(value)}
                    className={intent === value ? styles.activeIntent : ""}>
                    {readable(value)}
                  </button>
                ))}
              </div>
              <p className={styles.prediction}>Parser prediction: <b>{readable(sample.intent)}</b> · {Math.round(sample.confidence * 100)}%</p>
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>3</span><div><b>Label entity spans</b><small>Select exact words below, then choose a label. No entity is valid for unknown sentences.</small></div></div>
              <div ref={textRef} onMouseUp={captureSelection} className={styles.annotationText}>{sample.raw_utterance}</div>
              <div className={styles.labelBar}>
                {labels.map((label) => <button type="button" key={label} disabled={!selection} onClick={() => addEntity(label)}>{label}</button>)}
              </div>
              {selection && <p className={styles.selection}>Selected: “{selection.text}” [{selection.start}, {selection.end}]</p>}
              <div className={styles.entityList}>
                {entities.map((entity, index) => (
                  <div key={`${entity.start}-${entity.end}-${entity.label}`}>
                    <code>{entity.label}</code><span>“{entity.text}”</span><small>{entity.start}:{entity.end}</small>
                    <NormalizedValueControl entity={entity}
                      onChange={(value) => setEntities((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, normalized_value: value } : item))} />
                    <button type="button" aria-label="Remove entity" onClick={() => setEntities((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
                  </div>
                ))}
                {entities.length === 0 && <p>No entity spans labeled yet.</p>}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.step}><span>4</span><div><b>Dataset metadata</b><small>Evaluation candidates should be natural, independent examples—not rewritten training templates.</small></div></div>
              <div className={styles.metaGrid}>
                <label><span>Purpose</span><select value={purpose} onChange={(event) => setPurpose(event.target.value as DatasetPurpose)}>
                  <option value="train_candidate">Training candidate</option><option value="evaluation_candidate">Evaluation candidate</option>
                </select></label>
                <label><span>Phrase family <small>optional</small></span><input value={phraseFamily} onChange={(event) => setPhraseFamily(event.target.value)} placeholder="implicit-low-stock" /></label>
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
