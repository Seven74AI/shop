import sharp from 'sharp'
import { describe, expect, test, beforeAll } from 'vitest'
import {
	detectTypeFromMagicBytes,
	validateMagicBytes,
	validateFileSize,
	stripExifMetadata,
	scanForMalware,
	verifyUpload,
	MAX_IMAGE_SIZE,
	MAX_PDF_SIZE,
} from './upload-verify.server.ts'

// ─── Helpers: create valid test images with sharp ────────────────────────────

let testJpeg: Buffer
let testPng: Buffer
let testWebp: Buffer
let testJpegExif: Buffer  // JPEG with EXIF metadata
let testGif: Buffer

beforeAll(async () => {
	// Minimal valid JPEG (1x1 red pixel)
	testJpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } })
		.jpeg()
		.toBuffer()

	// Minimal valid PNG (1x1 blue pixel)
	testPng = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 255 } } })
		.png()
		.toBuffer()

	// Minimal valid WebP (1x1 green pixel)
	testWebp = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 255, b: 0 } } })
		.webp()
		.toBuffer()

	// JPEG with EXIF metadata (has APP1 marker)
	testJpegExif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } } })
		.jpeg()
		.withMetadata({ exif: { IFD0: { Make: 'Canon', Model: 'EOS 5D' } } })
		.toBuffer()

	// Minimal GIF (GIF89a header + 1x1 pixel)
	testGif = Buffer.from([
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
		0x01, 0x00, 0x01, 0x00, // 1x1 dimensions
		0x80, 0x00, 0x00, // global color table
		0x00, 0x00, 0x00, // bg color
		0x2c, 0x00, 0x00, 0x00, 0x00, // image descriptor
		0x01, 0x00, 0x01, 0x00, // 1x1
		0x00, 0x02, 0x02, 0x44, 0x01, 0x00, // LZW data
		0x3b, // trailer
	])
})

// ─── Minimal valid PDF (not created by sharp) ───────────────────────────────

function makePdf(): Buffer {
	return Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
}

function makeRandomBytes(size: number): Buffer {
	return Buffer.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)))
}

function makeFakeFile(name: string, type: string, buffer: Buffer): File {
	return new File([new Uint8Array(buffer)], name, { type })
}

// ─── Magic Byte Detection ────────────────────────────────────────────────────

describe('detectTypeFromMagicBytes', () => {
	test('detects JPEG from magic bytes', () => {
		expect(detectTypeFromMagicBytes(testJpeg)).toBe('image/jpeg')
	})

	test('detects PNG from magic bytes', () => {
		expect(detectTypeFromMagicBytes(testPng)).toBe('image/png')
	})

	test('detects WebP from magic bytes', () => {
		expect(detectTypeFromMagicBytes(testWebp)).toBe('image/webp')
	})

	test('detects GIF from magic bytes', () => {
		expect(detectTypeFromMagicBytes(testGif)).toBe('image/gif')
	})

	test('detects PDF from magic bytes', () => {
		expect(detectTypeFromMagicBytes(makePdf())).toBe('application/pdf')
	})

	test('returns null for unknown file types', () => {
		const random = makeRandomBytes(32)
		expect(detectTypeFromMagicBytes(random)).toBeNull()
	})

	test('returns null for text files disguised as images', () => {
		const text = Buffer.from('<html><body>not an image</body></html>', 'utf-8')
		expect(detectTypeFromMagicBytes(text)).toBeNull()
	})

	test('handles buffer too short for signatures', () => {
		const tiny = Buffer.from([0xff])
		expect(detectTypeFromMagicBytes(tiny)).toBeNull()
	})
})

// ─── Magic Byte Validation ───────────────────────────────────────────────────

describe('validateMagicBytes', () => {
	test('validates when claimed type matches magic bytes', () => {
		const result = validateMagicBytes(testJpeg, 'image/jpeg')
		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/jpeg')
	})

	test('rejects when claimed type does NOT match magic bytes', () => {
		const html = Buffer.from('<html>payload</html>', 'utf-8')
		const result = validateMagicBytes(html, 'image/png')
		expect(result.valid).toBe(false)
		expect(result.detectedType).toBeNull()
	})

	test('rejects JPEG sent as PNG', () => {
		const result = validateMagicBytes(testJpeg, 'image/png')
		expect(result.valid).toBe(false)
		expect(result.detectedType).toBe('image/jpeg')
	})

	test('rejects PDF sent as image', () => {
		const pdf = makePdf()
		const result = validateMagicBytes(pdf, 'image/jpeg')
		expect(result.valid).toBe(false)
		expect(result.detectedType).toBe('application/pdf')
	})
})

// ─── Size Validation ─────────────────────────────────────────────────────────

describe('validateFileSize', () => {
	test('allows files under the limit', () => {
		const smallBuffer = Buffer.alloc(1024) // 1KB
		const result = validateFileSize(smallBuffer, 'image/jpeg')
		expect(result.valid).toBe(true)
		expect(result.maxSize).toBe(MAX_IMAGE_SIZE)
	})

	test('rejects images over 10MB', () => {
		const bigBuffer = Buffer.alloc(MAX_IMAGE_SIZE + 1)
		const result = validateFileSize(bigBuffer, 'image/jpeg')
		expect(result.valid).toBe(false)
		expect(result.actualSize).toBe(MAX_IMAGE_SIZE + 1)
	})

	test('allows PDFs up to 20MB', () => {
		const pdfBuffer = Buffer.alloc(MAX_PDF_SIZE)
		const result = validateFileSize(pdfBuffer, 'application/pdf')
		expect(result.valid).toBe(true)
		expect(result.maxSize).toBe(MAX_PDF_SIZE)
	})

	test('rejects PDFs over 20MB', () => {
		const bigPdf = Buffer.alloc(MAX_PDF_SIZE + 1)
		const result = validateFileSize(bigPdf, 'application/pdf')
		expect(result.valid).toBe(false)
	})

	test('falls back to 5MB for unknown types', () => {
		const buffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
		const result = validateFileSize(buffer, 'application/octet-stream')
		expect(result.valid).toBe(false)
	})

	test('returns actual and max sizes in result', () => {
		const buffer = Buffer.alloc(42)
		const result = validateFileSize(buffer, 'image/webp')
		expect(result.actualSize).toBe(42)
		expect(result.maxSize).toBe(MAX_IMAGE_SIZE)
	})
})

// ─── EXIF Stripping ──────────────────────────────────────────────────────────

describe('stripExifMetadata', () => {
	test('strips EXIF from JPEG and returns valid image', async () => {
		const stripped = await stripExifMetadata(testJpegExif)

		expect(Buffer.isBuffer(stripped)).toBe(true)

		// Should still be a valid JPEG (starts with SOI marker)
		expect(stripped[0]).toBe(0xff)
		expect(stripped[1]).toBe(0xd8)

		// The stripped version should be smaller (metadata removed)
		expect(stripped.length).toBeGreaterThan(0)
		expect(stripped.length).toBeLessThan(testJpegExif.length)
	})

	test('stripped JPEG no longer contains EXIF APP1 marker', async () => {
		const stripped = await stripExifMetadata(testJpegExif)

		// Original has APP1
		expect(findMarker(testJpegExif, 0xff, 0xe1)).toBeGreaterThanOrEqual(0)

		// Stripped should NOT have APP1
		expect(findMarker(stripped, 0xff, 0xe1)).toBe(-1)
	})

	test('passes through unknown format unchanged', async () => {
		const random = makeRandomBytes(64)
		const result = await stripExifMetadata(random)
		expect(result).toBe(random) // Same buffer reference
	})

	test('passes through known-but-unsupported format unchanged', async () => {
		// GIF is in STRIPPABLE_MIME_TYPES but the stripExifMetadata
		// function only handles jpeg/png/webp — GIF returns as-is.
		const result = await stripExifMetadata(testGif)
		expect(result).toBe(testGif)
	})
})

function findMarker(buffer: Buffer, hi: number, lo: number): number {
	for (let i = 0; i < buffer.length - 1; i++) {
		if (buffer[i] === hi && buffer[i + 1] === lo) {
			return i
		}
	}
	return -1
}

// ─── Malware Scanning ────────────────────────────────────────────────────────

describe('scanForMalware', () => {
	test('returns true (placeholder pass-through)', async () => {
		const result = await scanForMalware(makeRandomBytes(128))
		expect(result).toBe(true)
	})
})

// ─── Full Pipeline: verifyUpload ─────────────────────────────────────────────

describe('verifyUpload', () => {
	test('validates a valid JPEG image successfully', async () => {
		const file = makeFakeFile('photo.jpg', 'image/jpeg', testJpeg)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/jpeg')
		expect(result.error).toBeUndefined()
		expect(result.sanitizedBuffer).toBeDefined()
	})

	test('validates a valid PNG image successfully', async () => {
		const file = makeFakeFile('icon.png', 'image/png', testPng)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/png')
	})

	test('validates a valid WebP image successfully', async () => {
		const file = makeFakeFile('hero.webp', 'image/webp', testWebp)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/webp')
	})

	test('validates a GIF image successfully', async () => {
		const file = makeFakeFile('animated.gif', 'image/gif', testGif)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/gif')
		// GIFs don't get EXIF stripping
		expect(result.sanitizedBuffer?.length).toBe(testGif.length)
	})

	test('validates a PDF successfully', async () => {
		const pdf = makePdf()
		const file = makeFakeFile('invoice.pdf', 'application/pdf', pdf)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('application/pdf')
	})

	test('rejects file with wrong extension/content mismatch', async () => {
		const text = Buffer.from('#!/bin/bash\necho "not an image"', 'utf-8')
		const file = makeFakeFile('script.png', 'image/png', text)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(false)
		expect(result.error).toContain('Unrecognized file format')
	})

	test('rejects JPEG sent as PDF', async () => {
		const file = makeFakeFile('fake.pdf', 'application/pdf', testJpeg)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(false)
		expect(result.error).toContain('mismatch')
		expect(result.detectedType).toBe('image/jpeg')
	})

	test('rejects file over size limit', async () => {
		const bigFile = Buffer.alloc(MAX_IMAGE_SIZE + 1)
		// Make it a valid JPEG header so it passes magic bytes but fails size
		bigFile[0] = 0xff
		bigFile[1] = 0xd8
		bigFile[2] = 0xff

		const file = makeFakeFile('huge.jpg', 'image/jpeg', bigFile)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(false)
		expect(result.error).toContain('too large')
	})

	test('strips EXIF from JPEG by default', async () => {
		const file = makeFakeFile('photo-with-exif.jpg', 'image/jpeg', testJpegExif)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(true)
		expect(result.sanitizedBuffer).toBeDefined()

		// Original has APP1 marker; sanitized should not
		expect(findMarker(testJpegExif, 0xff, 0xe1)).toBeGreaterThanOrEqual(0)
		expect(findMarker(result.sanitizedBuffer!, 0xff, 0xe1)).toBe(-1)
	})

	test('sanitized image is smaller after EXIF removal', async () => {
		const file = makeFakeFile('photo-with-exif.jpg', 'image/jpeg', testJpegExif)
		const result = await verifyUpload(file)

		expect(result.sanitizedBuffer!.length).toBeLessThan(testJpegExif.length)
	})

	test('preserves EXIF when skipExifStrip is true', async () => {
		const file = makeFakeFile('photo-with-exif.jpg', 'image/jpeg', testJpegExif)
		const result = await verifyUpload(file, { skipExifStrip: true })

		expect(result.valid).toBe(true)
		expect(result.sanitizedBuffer).toBeDefined()
		// Buffer should be unchanged
		expect(Buffer.compare(result.sanitizedBuffer!, testJpegExif)).toBe(0)
	})

	test('returns detected type even on mismatch', async () => {
		const file = makeFakeFile('evil.png', 'image/png', testJpeg)
		const result = await verifyUpload(file)

		expect(result.valid).toBe(false)
		expect(result.detectedType).toBe('image/jpeg')
	})
})
