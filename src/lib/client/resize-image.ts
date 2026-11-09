import { LABEL_PHOTO_MAX_CHARS } from '../schemas/label.ts';

/** Longest edge sent. A cost choice: Opus 5.5 reads up to 2576 px, but a label stays legible at 1568 px with fewer image tokens. */
export const LABEL_MAX_EDGE = 1568;

/** Tried in order until the data URI fits the server's size cap. */
const JPEG_QUALITIES = [0.85, 0.7, 0.5];

/**
 * Downscales a photo so its longer edge is at most `maxEdge` (never upscales) and re-encodes it as JPEG
 * (quality 0.85, lower if needed to stay within `maxChars`), which also turns HEIC from iOS into JPEG. Returns a
 * `data:image/jpeg;base64,` URI. Throws when even the lowest quality is too large.
 */
export async function resizeToJpegDataUri(
	file: Blob,
	maxEdge = LABEL_MAX_EDGE,
	maxChars = LABEL_PHOTO_MAX_CHARS
): Promise<string> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		for (const quality of JPEG_QUALITIES) {
			const uri = await blobToDataUri(await encodeJpeg(bitmap, width, height, quality));
			if (uri.length <= maxChars) return uri;
		}
		throw new Error('Photo too large');
	} finally {
		bitmap.close();
	}
}

async function encodeJpeg(
	source: ImageBitmap,
	width: number,
	height: number,
	quality: number
): Promise<Blob> {
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(width, height);
		draw(canvas.getContext('2d'), source, width, height);
		return canvas.convertToBlob({ type: 'image/jpeg', quality });
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	draw(canvas.getContext('2d'), source, width, height);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
			'image/jpeg',
			quality
		)
	);
}

function draw(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
	source: ImageBitmap,
	width: number,
	height: number
): void {
	if (!ctx) throw new Error('2D canvas unavailable');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, 0, 0, width, height);
}

function blobToDataUri(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
