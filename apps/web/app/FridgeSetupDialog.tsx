"use client";

import type {
  FridgeSetupItem,
  FridgeSetupResponse,
  InventoryItem,
} from "@jangoing/contracts";
import { ChevronLeft, Plus, Trash2, X } from "lucide-react";
import {
  useEffect,
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
import { prepareItemThumbnailDataUrl } from "../lib/item-thumbnail";

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
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState<SetupDraft[]>(() =>
    inventoryDrafts(inventory)
  );
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
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
    if (!restored) return;
    localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
  }, [drafts, restored]);

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

  async function handleDraftThumbnail(
    draftId: string,
    file: File | null,
  ) {
    if (!file) return;
    try {
      const thumbnailUrl = await prepareItemThumbnailDataUrl(file);
      updateDraft(draftId, { thumbnailUrl });
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the selected image.",
      );
    }
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

  function advance() {
    const validation = step === 1 ? validateNames() : validateDetails();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep((current) => Math.min(3, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      advance();
      return;
    }

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
          {step > 1 ? (
            <button
              type="button"
              aria-label="Previous step"
              onClick={() => {
                setError(null);
                setStep((current) => current - 1);
              }}
            >
              <ChevronLeft size={24} />
            </button>
          ) : (
            <span />
          )}
          <div>
            <small>STEP {step} OF 3</small>
            <h2 id="fridge-setup-title">
              {step === 1 ? "What do you have?" : step === 2 ? "Add details" : "Review"}
            </h2>
          </div>
          <button type="button" aria-label="Close setup" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <div className="fridge-setup-body">
          {step === 1 && (
            <>
              <p>Add the items currently in your fridge, freezer, or pantry.</p>
              <div className="fridge-setup-name-list">
                {drafts.map((draft, index) => (
                  <label key={draft.id}>
                    <span>{index + 1}</span>
                    <input
                      autoFocus={index === 0}
                      maxLength={120}
                      placeholder="e.g. Oat milk"
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft(draft.id, { name: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={drafts.length === 1}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((item) => item.id !== draft.id)
                        )
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </label>
                ))}
              </div>
              <button
                className="fridge-setup-add"
                type="button"
                disabled={drafts.length >= 100}
                onClick={() => setDrafts((current) => [...current, emptyDraft()])}
              >
                <Plus size={18} />
                Add Another Item
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <p>These values establish the starting state of your kitchen.</p>
              <div className="fridge-setup-detail-list">
                {drafts.map((draft) => (
                  <section key={draft.id}>
                    <h3>{titleCase(draft.name)}</h3>
                    <div className="fridge-setup-photo-row">
                      <div className="fridge-setup-photo-preview" aria-hidden="true">
                        {draft.thumbnailUrl ? (
                          <img
                            className="item-artwork-image"
                            src={draft.thumbnailUrl}
                            alt=""
                          />
                        ) : (
                          <span>{titleCase(draft.name).slice(0, 2) || "JG"}</span>
                        )}
                      </div>
                      <div className="fridge-setup-photo-actions">
                        <label className="inventory-photo-button">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/*"
                            onChange={(event) => {
                              const [file] = event.target.files ?? [];
                              event.currentTarget.value = "";
                              void handleDraftThumbnail(draft.id, file ?? null);
                            }}
                          />
                          Choose Photo
                        </label>
                        <label className="inventory-photo-button">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/*"
                            capture="environment"
                            onChange={(event) => {
                              const [file] = event.target.files ?? [];
                              event.currentTarget.value = "";
                              void handleDraftThumbnail(draft.id, file ?? null);
                            }}
                          />
                          Take Photo
                        </label>
                        {draft.thumbnailUrl && (
                          <button
                            className="inventory-photo-button is-secondary"
                            type="button"
                            onClick={() => updateDraft(draft.id, { thumbnailUrl: "" })}
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label>
                        <span>Quantity</span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          inputMode="decimal"
                          value={draft.quantity}
                          onChange={(event) =>
                            updateDraft(draft.id, { quantity: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>Unit</span>
                        <select
                          value={draft.unit}
                          onChange={(event) =>
                            updateDraft(draft.id, { unit: event.target.value })
                          }
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
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              location: event.target.value as SetupDraft["location"],
                            })
                          }
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
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              expirationDate: event.target.value,
                            })
                          }
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
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              lowThreshold: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p>
                Confirm this snapshot. Items you did not include will not be
                removed or marked out.
              </p>
              <div className="fridge-setup-review-list">
                {toSetupItems(drafts).map((item) => (
                  <section key={item.item_name}>
                    <strong>{titleCase(item.item_name)}</strong>
                    <span>
                      {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                      {item.location ? ` · ${titleCase(item.location)}` : ""}
                    </span>
                    <small>
                      {item.expiration_date
                        ? `Expires ${item.expiration_date}`
                        : "No expiry"}
                      {" · "}
                      {item.low_threshold
                        ? `Low at ${item.low_threshold}`
                        : "No low threshold"}
                    </small>
                  </section>
                ))}
              </div>
            </>
          )}
          {error && <p className="fridge-setup-error">{error}</p>}
        </div>

        <footer className="fridge-setup-footer">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : step === 3 ? "Set My Fridge" : "Continue"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
