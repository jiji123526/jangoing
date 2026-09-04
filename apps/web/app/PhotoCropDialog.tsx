"use client";

import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampSquareThumbnailCrop,
  maximumSquareThumbnailZoom,
  squareThumbnailCropZoom,
  updateSquareThumbnailCropZoom,
  type ItemThumbnailCrop,
} from "../lib/item-thumbnail";

type PhotoCropDialogProps = {
  titleId: string;
  objectUrl: string;
  width: number;
  height: number;
  crop: ItemThumbnailCrop;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCropChange: (crop: ItemThumbnailCrop) => void;
};

export function PhotoCropDialog({
  titleId,
  objectUrl,
  width,
  height,
  crop,
  busy,
  onClose,
  onConfirm,
  onCropChange,
}: PhotoCropDialogProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCrop: ItemThumbnailCrop;
  } | null>(null);

  const resolvedCrop = useMemo(
    () => clampSquareThumbnailCrop(width, height, crop),
    [crop, height, width],
  );
  const zoom = squareThumbnailCropZoom(width, height, resolvedCrop);
  const draggable = resolvedCrop.size < width || resolvedCrop.size < height;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !draggable || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: resolvedCrop,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    const frame = frameRef.current;
    if (
      !dragState ||
      dragState.pointerId !== event.pointerId ||
      !frame ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      return;
    }

    const frameBounds = frame.getBoundingClientRect();
    if (frameBounds.width <= 0) return;

    const scale = dragState.startCrop.size / frameBounds.width;
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;

    onCropChange(
      clampSquareThumbnailCrop(width, height, {
        ...dragState.startCrop,
        x: dragState.startCrop.x - deltaX * scale,
        y: dragState.startCrop.y - deltaY * scale,
      }),
    );
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  }

  return (
    <div
      className="fridge-setup-crop-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="fridge-setup-crop-panel">
        <div className="fridge-setup-crop-header">
          <div>
            <small>PHOTO CROP</small>
            <h3 id={titleId}>Trim to square</h3>
          </div>
          <button
            type="button"
            aria-label="Close photo crop"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p>Drag the photo inside the square and zoom before using it.</p>
        <div className="fridge-setup-crop-preview">
          <div
            ref={frameRef}
            className={`fridge-setup-crop-preview-frame${
              draggable ? " is-draggable" : ""
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
          >
            <img
              src={objectUrl}
              alt=""
              draggable={false}
              style={{
                width: `${(width / resolvedCrop.size) * 100}%`,
                height: `${(height / resolvedCrop.size) * 100}%`,
                left: `${(-resolvedCrop.x / resolvedCrop.size) * 100}%`,
                top: `${(-resolvedCrop.y / resolvedCrop.size) * 100}%`,
              }}
            />
            <span className="fridge-setup-crop-grid" aria-hidden="true" />
          </div>
        </div>
        <div className="fridge-setup-crop-controls">
          <label>
            <span>Zoom</span>
            <div className="fridge-setup-crop-zoom-row">
              <ZoomOut size={15} strokeWidth={2.1} aria-hidden="true" />
              <input
                type="range"
                min="1"
                max={String(maximumSquareThumbnailZoom)}
                step="0.01"
                value={zoom}
                disabled={busy}
                onChange={(event) =>
                  onCropChange(
                    updateSquareThumbnailCropZoom(
                      width,
                      height,
                      resolvedCrop,
                      Number(event.target.value),
                    ),
                  )
                }
              />
              <ZoomIn size={15} strokeWidth={2.1} aria-hidden="true" />
            </div>
          </label>
        </div>
        <div className="fridge-setup-crop-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Preparing…" : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
