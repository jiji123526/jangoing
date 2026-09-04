"use client";

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ItemThumbnailCrop = {
  x: number;
  y: number;
  size: number;
};

export const maximumSquareThumbnailZoom = 4;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the selected image."));
    image.src = source;
  });
}

export function validateItemThumbnailFile(file: File): void {
  if (!allowedContentTypes.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12MB.");
  }
}

export async function readItemThumbnailFile(file: File): Promise<{
  objectUrl: string;
  width: number;
  height: number;
}> {
  validateItemThumbnailFile(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    return {
      objectUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function releaseItemThumbnailObjectUrl(objectUrl: string): void {
  URL.revokeObjectURL(objectUrl);
}

export function defaultSquareThumbnailCrop(
  width: number,
  height: number,
): ItemThumbnailCrop {
  const size = Math.min(width, height);
  return {
    x: Math.max(0, Math.floor((width - size) / 2)),
    y: Math.max(0, Math.floor((height - size) / 2)),
    size,
  };
}

export function clampSquareThumbnailCrop(
  width: number,
  height: number,
  crop: ItemThumbnailCrop,
  maximumZoom = maximumSquareThumbnailZoom,
): ItemThumbnailCrop {
  const minDimension = Math.min(width, height);
  const minimumSize = Math.max(1, Math.ceil(minDimension / maximumZoom));
  const size = Math.max(
    minimumSize,
    Math.min(minDimension, Math.round(crop.size)),
  );

  return {
    size,
    x: Math.max(0, Math.min(width - size, Math.round(crop.x))),
    y: Math.max(0, Math.min(height - size, Math.round(crop.y))),
  };
}

export function squareThumbnailCropZoom(
  width: number,
  height: number,
  crop: ItemThumbnailCrop,
): number {
  const clampedCrop = clampSquareThumbnailCrop(width, height, crop);
  return Math.min(width, height) / clampedCrop.size;
}

export function updateSquareThumbnailCropZoom(
  width: number,
  height: number,
  crop: ItemThumbnailCrop,
  zoom: number,
  maximumZoom = maximumSquareThumbnailZoom,
): ItemThumbnailCrop {
  const current = clampSquareThumbnailCrop(width, height, crop, maximumZoom);
  const minDimension = Math.min(width, height);
  const nextZoom = Math.max(1, Math.min(maximumZoom, zoom));
  const nextSize = Math.max(1, Math.round(minDimension / nextZoom));
  const centerX = current.x + current.size / 2;
  const centerY = current.y + current.size / 2;

  return clampSquareThumbnailCrop(
    width,
    height,
    {
      size: nextSize,
      x: centerX - nextSize / 2,
      y: centerY - nextSize / 2,
    },
    maximumZoom,
  );
}

export async function prepareItemThumbnailDataUrl(
  file: File,
  crop?: ItemThumbnailCrop,
): Promise<string> {
  validateItemThumbnailFile(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const resolvedCrop =
      crop ?? defaultSquareThumbnailCrop(image.naturalWidth, image.naturalHeight);
    if (
      !Number.isFinite(resolvedCrop.size) ||
      resolvedCrop.size <= 0 ||
      resolvedCrop.x < 0 ||
      resolvedCrop.y < 0 ||
      resolvedCrop.x + resolvedCrop.size > image.naturalWidth ||
      resolvedCrop.y + resolvedCrop.size > image.naturalHeight
    ) {
      throw new Error("Could not read the selected image.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare the selected image.");
    }

    context.drawImage(
      image,
      resolvedCrop.x,
      resolvedCrop.y,
      resolvedCrop.size,
      resolvedCrop.size,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    for (const quality of [0.82, 0.72, 0.62]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 350_000) {
        return dataUrl;
      }
    }

    throw new Error("The selected image is too large after processing.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
