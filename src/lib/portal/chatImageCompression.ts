import {
  CHAT_IMAGE_TARGET_BYTES,
  MAX_CHAT_FILE_BYTES,
  isChatImageMimeType,
} from "@/lib/portal/uploadPolicy";

const MAX_IMAGE_EDGE = 2560;
const JPEG_QUALITIES = [0.86, 0.76, 0.66, 0.56] as const;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function outputFilename(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, "").trim() || "chat-foto";
  return `${stem}.jpg`;
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through an image element even
      // when createImageBitmap does not support them.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Das Foto konnte nicht optimiert werden."));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function optimizeChatImage(file: File) {
  if (file.size <= MAX_CHAT_FILE_BYTES) return file;
  if (!isChatImageMimeType(file.type)) {
    throw new Error("Diese Datei kann nicht als Foto optimiert werden.");
  }

  let loaded: LoadedImage;
  try {
    loaded = await loadImage(file);
  } catch {
    throw new Error(
      "Dieses Fotoformat kann auf dem Gerät nicht verkleinert werden. Bitte wählen Sie ein JPG-, PNG- oder WebP-Foto bis 4 MB.",
    );
  }

  try {
    if (!loaded.width || !loaded.height) {
      throw new Error("Das Foto besitzt keine gültigen Abmessungen.");
    }
    const initialScale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(loaded.width, loaded.height),
    );
    let width = Math.max(1, Math.round(loaded.width * initialScale));
    let height = Math.max(1, Math.round(loaded.height * initialScale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Foto-Optimierung wird nicht unterstützt.");

    let smallestBlob: Blob | null = null;
    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(loaded.source, 0, 0, width, height);

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpeg(canvas, quality);
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= CHAT_IMAGE_TARGET_BYTES) {
          return new File([blob], outputFilename(file.name), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }

      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }

    if (smallestBlob && smallestBlob.size <= MAX_CHAT_FILE_BYTES) {
      return new File([smallestBlob], outputFilename(file.name), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
    throw new Error("Das Foto bleibt nach der Optimierung zu groß.");
  } finally {
    loaded.cleanup();
  }
}
