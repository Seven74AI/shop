import sharp from 'sharp'
import { expect, test, describe } from 'vitest'
import {
	verifyImageMagicBytes,
	processImageUpload,
	IMAGE_MAX_DIMENSIONS,
} from './storage.server.ts'

// Helper to create a small valid PNG using sharp
async function createSmallPng(width = 1, height = 1): Promise<Buffer> {
	return sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 255, g: 0, b: 0 },
		},
	})
		.png()
		.toBuffer()
}

describe('verifyImageMagicBytes', () => {
	test('accepts valid JPEG magic bytes', () => {
		const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(true)
		expect(result.type).toBe('image/jpeg')
	})

	test('accepts valid PNG magic bytes', async () => {
		const buf = await createSmallPng()
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(true)
		expect(result.type).toBe('image/png')
	})

	test('accepts valid GIF magic bytes', () => {
		const buf = Buffer.from([
			0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
		])
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(true)
		expect(result.type).toBe('image/gif')
	})

	test('accepts valid WebP magic bytes', () => {
		const buf = Buffer.alloc(20)
		buf.write('RIFF', 0)
		buf.writeUInt32LE(12, 4)
		buf.write('WEBP', 8)
		buf.write('VP8 ', 12)
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(true)
		expect(result.type).toBe('image/webp')
	})

	test('rejects non-image buffer (plain text)', () => {
		const buf = Buffer.from('Hello, this is not an image!')
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(false)
	})

	test('rejects empty buffer', () => {
		const buf = Buffer.alloc(0)
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(false)
	})

	test('rejects PDF file (starts with %PDF)', () => {
		const buf = Buffer.from('%PDF-1.4\n%...')
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(false)
	})

	test('rejects buffer with only zeros', () => {
		const buf = Buffer.alloc(16)
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(false)
	})

	test('accepts JPEG with EXIF header', () => {
		// JPEG with EXIF marker (0xFFE1)
		const buf = Buffer.from([
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
		])
		const result = verifyImageMagicBytes(buf)
		expect(result.valid).toBe(true)
		expect(result.type).toBe('image/jpeg')
	})
})

describe('processImageUpload', () => {
	test('processes a valid PNG without resizing (within limits)', async () => {
		const buf = await createSmallPng()
		const file = new File([new Uint8Array(buf)], 'test.png', { type: 'image/png' })
		const result = await processImageUpload(file)
		expect(result).toBeInstanceOf(File)
		expect(result.name).toBe('test.png')
		// The result should still be a valid image
		const resultBuf = Buffer.from(await result.arrayBuffer())
		const verify = verifyImageMagicBytes(resultBuf)
		expect(verify.valid).toBe(true)
	})

	test('rejects non-image file', async () => {
		const buf = Buffer.from('not an image')
		const file = new File([buf], 'test.txt', { type: 'text/plain' })
		await expect(processImageUpload(file)).rejects.toThrow(
			/File is not a supported image type/,
		)
	})

	test('respects custom max dimensions', async () => {
		const buf = await createSmallPng()
		const file = new File([new Uint8Array(buf)], 'test.png', { type: 'image/png' })
		const result = await processImageUpload(file, {
			maxWidth: 100,
			maxHeight: 100,
		})
		expect(result).toBeInstanceOf(File)
	})

	test('allows WebP images', async () => {
		// sharp can process WebP but a minimal buffer won't have valid WebP data.
		// Test only magic byte verification for WebP.
		const buf = Buffer.alloc(20)
		buf.write('RIFF', 0)
		buf.writeUInt32LE(12, 4)
		buf.write('WEBP', 8)
		buf.write('VP8 ', 12)
		const verify = verifyImageMagicBytes(buf)
		expect(verify.valid).toBe(true)
	})
})

describe('IMAGE_MAX_DIMENSIONS', () => {
	test('has sensible defaults', () => {
		expect(IMAGE_MAX_DIMENSIONS.PROFILE_IMAGE.width).toBeGreaterThan(0)
		expect(IMAGE_MAX_DIMENSIONS.PROFILE_IMAGE.height).toBeGreaterThan(0)
		expect(IMAGE_MAX_DIMENSIONS.PRODUCT_IMAGE.width).toBeGreaterThan(0)
		expect(IMAGE_MAX_DIMENSIONS.PRODUCT_IMAGE.height).toBeGreaterThan(0)
		expect(IMAGE_MAX_DIMENSIONS.NOTE_IMAGE.width).toBeGreaterThan(0)
		expect(IMAGE_MAX_DIMENSIONS.NOTE_IMAGE.height).toBeGreaterThan(0)
	})

	test('max dimensions are reasonable', () => {
		// Profile images should be smaller than product images
		expect(IMAGE_MAX_DIMENSIONS.PROFILE_IMAGE.width).toBeLessThanOrEqual(
			IMAGE_MAX_DIMENSIONS.PRODUCT_IMAGE.width,
		)
	})
})
