import { describe, expect, it } from 'vitest';
import { resizeToJpegDataUri } from './resize-image';

async function pngBlob(width: number, height: number): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas unavailable');
	ctx.fillStyle = '#4a9';
	ctx.fillRect(0, 0, width, height);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
			'image/png'
		)
	);
}

async function decodedSize(dataUri: string): Promise<{ width: number; height: number }> {
	const bitmap = await createImageBitmap(await (await fetch(dataUri)).blob());
	const size = { width: bitmap.width, height: bitmap.height };
	bitmap.close();
	return size;
}

describe('resizeToJpegDataUri', () => {
	it('caps the longer edge at 1568, keeps the aspect ratio and returns a JPEG data URI', async () => {
		const uri = await resizeToJpegDataUri(await pngBlob(3000, 1000));
		expect(uri).toMatch(/^data:image\/jpeg;base64,/);
		expect(await decodedSize(uri)).toEqual({ width: 1568, height: 523 });
	});

	it('never upscales an image already within the limit', async () => {
		const uri = await resizeToJpegDataUri(await pngBlob(800, 600));
		expect(await decodedSize(uri)).toEqual({ width: 800, height: 600 });
	});
});
