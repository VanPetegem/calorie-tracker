/** Longest edge Claude reads an image at natively; larger images are only downscaled server side. */
export const LABEL_MAX_EDGE = 1568;

const JPEG_QUALITY = 0.85;

/**
 * Downscales a photo so its longer edge is at most `maxEdge` (never upscales) and re-encodes it as JPEG
 * (quality 0.85), which also turns HEIC from iOS into JPEG. Returns a `data:image/jpeg;base64,` URI.
 */
export async function resizeToJpegDataUri(file: Blob, maxEdge = LABEL_MAX_EDGE): Promise<string> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	try {
		const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const jpeg = await encodeJpeg(bitmap, width, height);
		return await blobToDataUri(jpeg);
	} finally {
		bitmap.close();
	}
}

async function encodeJpeg(source: ImageBitmap, width: number, height: number): Promise<Blob> {
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(width, height);
		draw(canvas.getContext('2d'), source, width, height);
		return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	draw(canvas.getContext('2d'), source, width, height);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
			'image/jpeg',
			JPEG_QUALITY
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
