"use client";

import type {
  FridgeSetupItem,
  FridgeSetupResponse,
  InventoryItem,
} from "@jangoing/contracts";
import { Camera, ChevronDown, Plus, Trash2, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  completeFridgeSetup,
  uploadItemThumbnail,
} from "../lib/api";
import {
  applyUploadedThumbnails,
  setupThumbnailUploads,
} from "../lib/fridge-setup-thumbnail";
import {
  defaultSquareThumbnailCrop,
  prepareItemThumbnailDataUrl,
  readItemThumbnailFile,
  releaseItemThumbnailObjectUrl,
  type ItemThumbnailCrop,
} from "../lib/item-thumbnail";

const draftStorageKey = "jangoing.fridge-setup-draft.v1";
const units = [
  "piece",
  "bottle",
  "carton",
  "bag",
  "box",
  "can",
  "jar",
  "pack",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "cup",
] as const;

type SetupDraft = {
  id: string;
  name: string;
  thumbnailUrl: string;
  quantity: string;
  unit: string;
  location: "" | "fridge" | "freezer" | "pantry";
  expirationDate: string;
  lowThreshold: string;
};

type PendingThumbnailCrop = {
  crop: ItemThumbnailCrop;
  draftId: string;
  file: File;
  objectUrl: string;
  width: number;
  height: number;
};

function canonicalItemName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyDraft(): SetupDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    thumbnailUrl: "",
    quantity: "1",
    unit: "",
    location: "fridge",
    expirationDate: "",
    lowThreshold: "",
  };
}

function inventoryDrafts(inventory: InventoryItem[]): SetupDraft[] {
  if (inventory.length === 0) return [emptyDraft()];
  return inventory.map((item) => ({
    id: crypto.randomUUID(),
    name: titleCase(item.item_name),
    thumbnailUrl: item.thumbnail_url ?? "",
    quantity: item.quantity > 0 ? String(item.quantity) : "1",
    unit: item.unit ?? "",
    location: item.location ?? "fridge",
    expirationDate: item.nearest_expiration_date ?? "",
    lowThreshold: item.low_threshold ? String(item.low_threshold) : "",
  }));
}

function validStoredDrafts(value: unknown): value is SetupDraft[] {
  return Array.isArray(value) && value.length > 0 && value.every((draft) =>
    typeof draft === "object" &&
    draft !== null &&
    Object.values(draft).every((field) => typeof field === "string")
  );
}

function normalizeStoredDrafts(value: SetupDraft[]): SetupDraft[] {
  return value.map((draft) => ({
    ...emptyDraft(),
    ...draft,
    thumbnailUrl:
      typeof draft.thumbnailUrl === "string" ? draft.thumbnailUrl : "",
  }));
}

function toSetupItems(drafts: SetupDraft[]): FridgeSetupItem[] {
  return drafts.map((draft) => ({
    item_name: canonicalItemName(draft.name),
    quantity: Number(draft.quantity),
    unit: draft.unit || null,
    location: draft.location || null,
    expiration_date: draft.expirationDate || null,
    low_threshold: draft.lowThreshold ? Number(draft.lowThreshold) : null,
  }));
}

function SetupArtworkLabel({
  itemName,
}: {
  itemName: string;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(20);

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;

    function fitLabel() {
      const currentLabel = labelRef.current;
      if (!currentLabel) return;
      const renderedSize = Number.parseFloat(getComputedStyle(currentLabel).fontSize);
      const words = [...currentLabel.querySelectorAll<HTMLElement>(".artwork-word")];
      const widestWord = Math.max(...words.map((word) => word.scrollWidth), 1);
      const labelStyle = getComputedStyle(currentLabel);
      const availableWidth = currentLabel.clientWidth
        - Number.parseFloat(labelStyle.paddingLeft)
        - Number.parseFloat(labelStyle.paddingRight);
      const fittedSize = Math.max(
        8,
        Math.min(20, Math.floor(renderedSize * (availableWidth / widestWord))),
      );
      setFontSize(fittedSize);
    }

    fitLabel();
    const resizeObserver = new ResizeObserver(fitLabel);
    resizeObserver.observe(label.parentElement ?? label);
    void document.fonts?.ready.then(fitLabel);
    return () => resizeObserver.disconnect();
  }, [itemName]);

  return (
    <span ref={labelRef} style={{ fontSize: `${fontSize}px` }}>
      {titleCase(itemName).split(" ").map((word, index) => (
        <span className="artwork-word" key={`${word}-${index}`}>
          {word}
        </span>
      ))}
    </span>
  );
}

export function FridgeSetupDialog({
  open,
  inventory,
  onClose,
  onComplete,
  onNotice,
}: {
  open: boolean;
  inventory: InventoryItem[];
  onClose: () => void;
  onComplete: (result: FridgeSetupResponse) => void;
  onNotice?: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<SetupDraft[]>(() =>
    inventoryDrafts(inventory)
  );
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(
    drafts[0]?.id ?? null,
  );
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingCrop, setApplyingCrop] = useState(false);
  const [pendingThumbnailCrop, setPendingThumbnailCrop] =
    useState<PendingThumbnailCrop | null>(null);
  const [thumbnailLoadedByDraftId, setThumbnailLoadedByDraftId] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (restored) return;
    try {
      const stored = JSON.parse(localStorage.getItem(draftStorageKey) ?? "null");
      if (validStoredDrafts(stored)) setDrafts(normalizeStoredDrafts(stored));
      else setDrafts(inventoryDrafts(inventory));
    } catch {
      setDrafts(inventoryDrafts(inventory));
    }
    setRestored(true);
  }, [inventory, restored]);

  useEffect(() => {
    if (drafts.length === 0) {
      setExpandedDraftId(null);
      return;
    }
    if (!expandedDraftId || !drafts.some((draft) => draft.id === expandedDraftId)) {
      setExpandedDraftId(drafts[0].id);
    }
  }, [drafts, expandedDraftId]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
  }, [drafts, restored]);

  useEffect(() => {
    const objectUrl = pendingThumbnailCrop?.objectUrl;
    return () => {
      if (objectUrl) {
        releaseItemThumbnailObjectUrl(objectUrl);
      }
    };
  }, [pendingThumbnailCrop?.objectUrl]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function updateDraft(id: string, update: Partial<SetupDraft>) {
    setDrafts((current) =>
      current.map((draft) => draft.id === id ? { ...draft, ...update } : draft)
    );
  }

  function toggleDraft(id: string) {
    setExpandedDraftId((current) => current === id ? null : id);
  }

  async function handleDraftThumbnail(
    draftId: string,
    file: File | null,
  ) {
    if (!file) return;
    try {
      const prepared = await readItemThumbnailFile(file);
      setPendingThumbnailCrop({
        crop: defaultSquareThumbnailCrop(prepared.width, prepared.height),
        draftId,
        file,
        objectUrl: prepared.objectUrl,
        width: prepared.width,
        height: prepared.height,
      });
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the selected image.",
      );
    }
  }

  function closePendingThumbnailCrop() {
    if (pendingThumbnailCrop) {
      releaseItemThumbnailObjectUrl(pendingThumbnailCrop.objectUrl);
    }
    setPendingThumbnailCrop(null);
    setApplyingCrop(false);
  }

  async function applyPendingThumbnailCrop() {
    if (!pendingThumbnailCrop) return;
    setApplyingCrop(true);
    try {
      const thumbnailUrl = await prepareItemThumbnailDataUrl(
        pendingThumbnailCrop.file,
        pendingThumbnailCrop.crop,
      );
      updateDraft(pendingThumbnailCrop.draftId, { thumbnailUrl });
      setThumbnailLoadedByDraftId((current) => ({
        ...current,
        [pendingThumbnailCrop.draftId]: false,
      }));
      setError(null);
      closePendingThumbnailCrop();
    } catch (caught) {
      setApplyingCrop(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the selected image.",
      );
    }
  }

  function updatePendingThumbnailCrop(
    axis: "x" | "y",
    nextValue: number,
  ) {
    setPendingThumbnailCrop((current) => {
      if (!current) return null;
      return {
        ...current,
        crop: {
          ...current.crop,
          [axis]: nextValue,
        },
      };
    });
  }

  function draftSummary(draft: SetupDraft): string {
    const parts = [
      draft.quantity ? `${draft.quantity}${draft.unit ? ` ${draft.unit}` : ""}` : null,
      draft.location ? titleCase(draft.location) : null,
      draft.expirationDate ? `Expires ${draft.expirationDate}` : "No expiry",
      draft.lowThreshold ? `Low at ${draft.lowThreshold}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.join(" · ");
  }

  function validateNames(): string | null {
    const names = drafts.map((draft) => canonicalItemName(draft.name));
    if (names.some((name) => !name)) return "Enter a name for every item.";
    if (new Set(names).size !== names.length) {
      return "Each item can appear only once.";
    }
    return null;
  }

  function validateDetails(): string | null {
    for (const draft of drafts) {
      const quantity = Number(draft.quantity);
      const threshold = draft.lowThreshold ? Number(draft.lowThreshold) : null;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return `${titleCase(draft.name)} needs a quantity greater than zero.`;
      }
      if (threshold !== null && (!Number.isFinite(threshold) || threshold <= 0)) {
        return `${titleCase(draft.name)} needs a low threshold greater than zero.`;
      }
    }
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateNames() ?? validateDetails();
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await completeFridgeSetup({ items: toSetupItems(drafts) });
      const uploads = setupThumbnailUploads(drafts);
      let completedResult = result;

      if (uploads.length > 0) {
        const settled = await Promise.allSettled(
          uploads.map(({ itemName, thumbnailUrl }) =>
            uploadItemThumbnail(itemName, thumbnailUrl),
          ),
        );
        const uploaded = settled.flatMap((entry) =>
          entry.status === "fulfilled" ? [entry.value] : [],
        );
        const failed = settled.length - uploaded.length;
        if (uploaded.length > 0) {
          completedResult = {
            ...result,
            inventory: applyUploadedThumbnails(result.inventory, uploaded),
          };
        }
        if (failed > 0) {
          onNotice?.(
            `Kitchen setup saved, but ${failed} photo upload${failed === 1 ? "" : "s"} failed.`,
          );
        }
      }

      localStorage.removeItem(draftStorageKey);
      onComplete(completedResult);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save fridge setup.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      className="fridge-setup-dialog"
      ref={dialogRef}
      aria-labelledby="fridge-setup-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="fridge-setup-header">
          <span />
          <div>
            <small>KITCHEN SETUP</small>
            <h2 id="fridge-setup-title">Set Up My Fridge</h2>
          </div>
          <button type="button" aria-label="Close setup" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <div className="fridge-setup-body">
          <p>
            Add what you currently have. Each item keeps its name and details
            together, and you can collapse rows you are done with.
          </p>
          <div className="fridge-setup-detail-list is-collapsible">
            {drafts.map((draft, index) => {
              const isExpanded = expandedDraftId === draft.id;
              const displayName = titleCase(draft.name) || `Item ${index + 1}`;
              const summary = draftSummary(draft);
              const photoInputId = `fridge-setup-photo-${draft.id}`;
              const thumbnailLoaded =
                draft.thumbnailUrl !== "" &&
                (thumbnailLoadedByDraftId[draft.id] ?? false);

              return (
                <section
                  key={draft.id}
                  className={isExpanded ? "is-expanded" : undefined}
                >
                  <div className="inventory-item-row fridge-setup-item-shell">
                    <input
                      id={photoInputId}
                      className="fridge-setup-hidden-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      aria-label={`${draft.thumbnailUrl ? "Change" : "Add"} photo for ${displayName}`}
                      onChange={(event) => {
                        const [file] = event.target.files ?? [];
                        event.currentTarget.value = "";
                        void handleDraftThumbnail(draft.id, file ?? null);
                      }}
                    />
                    <label
                      htmlFor={photoInputId}
                      className={`inventory-artwork fridge-setup-artwork-button${
                        draft.thumbnailUrl ? " has-photo" : ""
                      }`}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        document.getElementById(photoInputId)?.click();
                      }}
                    >
                      {draft.thumbnailUrl && !thumbnailLoaded && (
                        <span
                          className="fridge-setup-artwork-skeleton"
                          aria-hidden="true"
                        />
                      )}
                      {draft.thumbnailUrl ? (
                        <img
                          className={`item-artwork-image${
                            thumbnailLoaded
                              ? " fridge-setup-artwork-image-visible"
                              : " fridge-setup-artwork-image-hidden"
                          }`}
                          src={draft.thumbnailUrl}
                          alt=""
                          onLoad={() =>
                            setThumbnailLoadedByDraftId((current) => ({
                              ...current,
                              [draft.id]: true,
                            }))
                          }
                          onError={() =>
                            setThumbnailLoadedByDraftId((current) => ({
                              ...current,
                              [draft.id]: true,
                            }))
                          }
                        />
                      ) : (
                        <SetupArtworkLabel itemName={displayName} />
                      )}
                      {draft.thumbnailUrl && thumbnailLoaded && (
                        <small className="fridge-setup-artwork-overlay">
                          Tap to replace
                        </small>
                      )}
                    </label>
                    <div className="inventory-item-copy fridge-setup-item-copy">
                      <div className="fridge-setup-item-copy-header">
                        <label className="fridge-setup-item-name">
                          <span>{index + 1}</span>
                          <input
                            autoFocus={index === 0}
                            maxLength={120}
                            placeholder="e.g. Oat milk"
                            value={draft.name}
                            onFocus={() => setExpandedDraftId(draft.id)}
                            onChange={(event) => {
                              updateDraft(draft.id, { name: event.target.value });
                              setError(null);
                            }}
                          />
                        </label>
                        <span className="inventory-item-row-actions fridge-setup-item-actions">
                          {!draft.thumbnailUrl && (
                            <span
                              className="fridge-setup-missing-photo-indicator"
                              aria-label="No photo"
                            >
                              <Camera size={14} strokeWidth={2.2} />
                            </span>
                          )}
                          <button
                            type="button"
                            className="fridge-setup-toggle"
                            aria-expanded={isExpanded}
                            aria-controls={`fridge-setup-item-${draft.id}`}
                            onClick={() => toggleDraft(draft.id)}
                          >
                            <ChevronDown size={18} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove item ${index + 1}`}
                            disabled={drafts.length === 1}
                            onClick={() => {
                              setDrafts((current) =>
                                current.filter((item) => item.id !== draft.id)
                              );
                              setError(null);
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </span>
                      </div>
                      <p>{summary}</p>
                      <div className="inventory-item-footer fridge-setup-item-footer">
                        {!draft.thumbnailUrl && (
                          <small className="inventory-item-added-at">
                            Tap thumbnail to add a photo.
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div id={`fridge-setup-item-${draft.id}`}>
                      {draft.thumbnailUrl && (
                        <div className="fridge-setup-photo-row">
                          <button
                            className="inventory-photo-button is-secondary"
                            type="button"
                            onClick={() => {
                              updateDraft(draft.id, { thumbnailUrl: "" });
                              setError(null);
                            }}
                          >
                            Remove Photo
                          </button>
                        </div>
                      )}
                      <div>
                        <label>
                          <span>Quantity</span>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            inputMode="decimal"
                            value={draft.quantity}
                            onChange={(event) => {
                              updateDraft(draft.id, { quantity: event.target.value });
                              setError(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>Unit</span>
                          <select
                            value={draft.unit}
                            onChange={(event) => {
                              updateDraft(draft.id, { unit: event.target.value });
                              setError(null);
                            }}
                          >
                            <option value="">Not set</option>
                            {units.map((unit) => (
                              <option value={unit} key={unit}>{titleCase(unit)}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Location</span>
                          <select
                            value={draft.location}
                            onChange={(event) => {
                              updateDraft(draft.id, {
                                location: event.target.value as SetupDraft["location"],
                              });
                              setError(null);
                            }}
                          >
                            <option value="">Not set</option>
                            <option value="fridge">Fridge</option>
                            <option value="freezer">Freezer</option>
                            <option value="pantry">Pantry</option>
                          </select>
                        </label>
                        <label>
                          <span>Expiry</span>
                          <input
                            type="date"
                            value={draft.expirationDate}
                            onChange={(event) => {
                              updateDraft(draft.id, {
                                expirationDate: event.target.value,
                              });
                              setError(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>Low at</span>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            inputMode="decimal"
                            placeholder="Optional"
                            value={draft.lowThreshold}
                            onChange={(event) => {
                              updateDraft(draft.id, {
                                lowThreshold: event.target.value,
                              });
                              setError(null);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <button
            className="fridge-setup-add"
            type="button"
            disabled={drafts.length >= 100}
            onClick={() => {
              const nextDraft = emptyDraft();
              setDrafts((current) => [...current, nextDraft]);
              setExpandedDraftId(nextDraft.id);
              setError(null);
            }}
          >
            <Plus size={18} />
            Add Another Item
          </button>
          {error && <p className="fridge-setup-error">{error}</p>}
        </div>

        <footer className="fridge-setup-footer">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Set My Fridge"}
          </button>
        </footer>
      </form>
      {pendingThumbnailCrop && (
        <div
          className="fridge-setup-crop-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fridge-setup-crop-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !applyingCrop) {
              closePendingThumbnailCrop();
            }
          }}
        >
          <div className="fridge-setup-crop-panel">
            <div className="fridge-setup-crop-header">
              <div>
                <small>PHOTO CROP</small>
                <h3 id="fridge-setup-crop-title">Trim to square</h3>
              </div>
              <button
                type="button"
                aria-label="Close photo crop"
                disabled={applyingCrop}
                onClick={closePendingThumbnailCrop}
              >
                <X size={18} />
              </button>
            </div>
            <p>Adjust the square crop before using this photo.</p>
            <div className="fridge-setup-crop-preview">
              <div className="fridge-setup-crop-preview-frame">
                <img
                  src={pendingThumbnailCrop.objectUrl}
                  alt=""
                  style={{
                    width: `${(pendingThumbnailCrop.width / pendingThumbnailCrop.crop.size) * 100}%`,
                    height: `${(pendingThumbnailCrop.height / pendingThumbnailCrop.crop.size) * 100}%`,
                    left: `${(-pendingThumbnailCrop.crop.x / pendingThumbnailCrop.crop.size) * 100}%`,
                    top: `${(-pendingThumbnailCrop.crop.y / pendingThumbnailCrop.crop.size) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="fridge-setup-crop-controls">
              <label>
                <span>Horizontal</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(
                    0,
                    pendingThumbnailCrop.width - pendingThumbnailCrop.crop.size,
                  )}
                  step="1"
                  value={pendingThumbnailCrop.crop.x}
                  disabled={
                    applyingCrop ||
                    pendingThumbnailCrop.width === pendingThumbnailCrop.crop.size
                  }
                  onChange={(event) =>
                    updatePendingThumbnailCrop("x", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Vertical</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(
                    0,
                    pendingThumbnailCrop.height - pendingThumbnailCrop.crop.size,
                  )}
                  step="1"
                  value={pendingThumbnailCrop.crop.y}
                  disabled={
                    applyingCrop ||
                    pendingThumbnailCrop.height === pendingThumbnailCrop.crop.size
                  }
                  onChange={(event) =>
                    updatePendingThumbnailCrop("y", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="fridge-setup-crop-actions">
              <button
                type="button"
                disabled={applyingCrop}
                onClick={closePendingThumbnailCrop}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applyingCrop}
                onClick={() => void applyPendingThumbnailCrop()}
              >
                {applyingCrop ? "Preparing…" : "Use Photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
