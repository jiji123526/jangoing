"use client";

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the selected image."));
    image.src = source;
  });
}

export async function prepareItemThumbnailDataUrl(
  file: File,
): Promise<string> {
  if (!allowedContentTypes.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    if (!Number.isFinite(edge) || edge <= 0) {
      throw new Error("Could not read the selected image.");
    }

    const sourceX = Math.max(0, Math.floor((image.naturalWidth - edge) / 2));
    const sourceY = Math.max(0, Math.floor((image.naturalHeight - edge) / 2));
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare the selected image.");
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      edge,
      edge,
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
