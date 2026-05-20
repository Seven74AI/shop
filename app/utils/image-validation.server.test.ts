import { describe, it, expect, vi, beforeAll } from 'vitest'
import { Buffer } from 'buffer'

// We'll test the core logic directly since sharp won't be available until installed.
// The magic byte functions are pure and don't depend on sharp.
import {
	MAGIC_BYTES,
	verifyMagicBytes,
	validateImage,
	ImageValidationError,
	type ImageValidationOptions,
} from './image-validation.server.ts'

// Helper: create a mock FileUpload with given content and type
function createMockFile(
	filename: string,
	mimeType: string,
	content: Buffer | Uint8Array,
	size?: number,
): File {
	const blob = new Blob([content], { type: mimeType })
	const file = new File([blob], filename, { type: mimeType })
	// Override size if needed
	if (size !== undefined) {
		Object.defineProperty(file, 'size', { value: size, writable: false })
	}
	return file
}

// Real magic byte sequences
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00])
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
const AVIF_HEADER = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])
const SVG_HEADER_XML = '<?xml version="1.0" encoding="UTF-8"?><svg></svg>'
const SVG_HEADER_SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
const SVG_HEADER_DOCTYPE = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>'

describe('MAGIC_BYTES constant', () => {
	it('should define magic bytes for JPEG', () => {
		expect(MAGIC_BYTES['image/jpeg']).toBeDefined()
		expect(MAGIC_BYTES['image/jpeg'].bytes).toEqual([0xff, 0xd8, 0xff])
	})

	it('should define magic bytes for PNG', () => {
		expect(MAGIC_BYTES['image/png']).toBeDefined()
		expect(MAGIC_BYTES['image/png'].bytes).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	})

	it('should define magic bytes for GIF', () => {
		expect(MAGIC_BYTES['image/gif']).toBeDefined()
		expect(MAGIC_BYTES['image/gif'].bytes).toEqual([0x47, 0x49, 0x46, 0x38])
	})

	it('should define magic bytes for WebP', () => {
		expect(MAGIC_BYTES['image/webp']).toBeDefined()
		expect(MAGIC_BYTES['image/webp'].bytes).toEqual([0x52, 0x49, 0x46, 0x46])
	})

	it('should define magic bytes for AVIF', () => {
		expect(MAGIC_BYTES['image/avif']).toBeDefined()
		expect(MAGIC_BYTES['image/avif'].bytes).toEqual([
			0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
		])
	})
})

describe('verifyMagicBytes', () => {
	it('should accept a valid JPEG file', async () => {
		const file = createMockFile('photo.jpg', 'image/jpeg', JPEG_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(true)
	})

	it('should accept a valid PNG file', async () => {
		const file = createMockFile('icon.png', 'image/png', PNG_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(true)
	})

	it('should accept a valid GIF file', async () => {
		const file = createMockFile('anim.gif', 'image/gif', GIF_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(true)
	})

	it('should accept a valid WebP file', async () => {
		const file = createMockFile('img.webp', 'image/webp', WEBP_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(true)
	})

	it('should accept a valid AVIF file', async () => {
		const file = createMockFile('img.avif', 'image/avif', AVIF_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(true)
	})

	it('should reject a file with wrong magic bytes for its claimed type', async () => {
		// Claim JPEG but provide PNG bytes
		const file = createMockFile('fake.jpg', 'image/jpeg', PNG_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(false)
	})

	it('should reject a text file claiming to be an image', async () => {
		const textContent = new TextEncoder().encode('Hello, world!')
		const file = createMockFile('evil.jpg', 'image/jpeg', textContent)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(false)
	})

	it('should reject unknown MIME types', async () => {
		const file = createMockFile('data.bin', 'application/octet-stream', JPEG_HEADER)
		const result = await verifyMagicBytes(file)
		expect(result).toBe(false)
	})

	it('should reject empty files', async () => {
		const file = createMockFile('empty.jpg', 'image/jpeg', new Uint8Array(0))
		const result = await verifyMagicBytes(file)
		expect(result).toBe(false)
	})

	describe('SVG files', () => {
		it('should accept SVG starting with <?xml', async () => {
			const file = createMockFile('img.svg', 'image/svg+xml', new TextEncoder().encode(SVG_HEADER_XML))
			const result = await verifyMagicBytes(file)
			expect(result).toBe(true)
		})

		it('should accept SVG starting with <svg', async () => {
			const file = createMockFile('img.svg', 'image/svg+xml', new TextEncoder().encode(SVG_HEADER_SVG))
			const result = await verifyMagicBytes(file)
			expect(result).toBe(true)
		})

		it('should accept SVG starting with <!DOCTYPE', async () => {
			const file = createMockFile('img.svg', 'image/svg+xml', new TextEncoder().encode(SVG_HEADER_DOCTYPE))
			const result = await verifyMagicBytes(file)
			expect(result).toBe(true)
		})

		it('should reject non-XML content claiming to be SVG', async () => {
			const file = createMockFile('evil.svg', 'image/svg+xml', new TextEncoder().encode('{"malicious": "json"}'))
			const result = await verifyMagicBytes(file)
			expect(result).toBe(false)
		})
	})
})

describe('validateImage', () => {
	const originalEnv = process.env

	beforeAll(() => {
		process.env = { ...originalEnv, MOCKS: 'true' }
	})

	it('should reject files exceeding maxFileSize', async () => {
		const file = createMockFile('big.jpg', 'image/jpeg', JPEG_HEADER, 10_000_001)
		const result = await validateImage(file, { maxFileSize: 10_000_000 })
		expect(result.valid).toBe(false)
		expect(result.error).toContain('exceeds maximum allowed size')
	})

	it('should accept files under maxFileSize', async () => {
		const file = createMockFile('small.jpg', 'image/jpeg', JPEG_HEADER, 1_000_000)
		const result = await validateImage(file, { maxFileSize: 10_000_000 })
		expect(result.valid).toBe(true)
	})

	it('should reject files with non-allowed MIME types', async () => {
		const file = createMockFile('img.png', 'image/png', PNG_HEADER)
		const result = await validateImage(file, {
			allowedTypes: ['image/jpeg', 'image/webp'],
		})
		expect(result.valid).toBe(false)
		expect(result.error).toContain('not allowed')
	})

	it('should accept files with allowed MIME types', async () => {
		const file = createMockFile('img.png', 'image/png', PNG_HEADER)
		const result = await validateImage(file, {
			allowedTypes: ['image/png', 'image/jpeg'],
		})
		expect(result.valid).toBe(true)
	})

	it('should reject files with mismatched magic bytes', async () => {
		const textContent = new TextEncoder().encode('Hello, world!')
		const file = createMockFile('evil.jpg', 'image/jpeg', textContent)
		const result = await validateImage(file)
		expect(result.valid).toBe(false)
		expect(result.error).toContain('Magic byte verification failed')
	})

	it('should accept valid JPEG with matching magic bytes (mock mode)', async () => {
		const file = createMockFile('photo.jpg', 'image/jpeg', JPEG_HEADER)
		const result = await validateImage(file)
		expect(result.valid).toBe(true)
		expect(result.detectedType).toBe('image/jpeg')
	})

	it('should accept valid PNG with matching magic bytes (mock mode)', async () => {
		const file = createMockFile('icon.png', 'image/png', PNG_HEADER)
		const result = await validateImage(file)
		expect(result.valid).toBe(true)
	})

	describe('in mock mode', () => {
		it('should return width=0, height=0', async () => {
			const file = createMockFile('photo.jpg', 'image/jpeg', JPEG_HEADER)
			const result = await validateImage(file)
			expect(result.valid).toBe(true)
			expect(result.width).toBe(0)
			expect(result.height).toBe(0)
		})

		it('should skip dimension checks', async () => {
			const file = createMockFile('photo.jpg', 'image/jpeg', JPEG_HEADER)
			const result = await validateImage(file, { maxWidth: 100, maxHeight: 100 })
			// In mock mode, width/height are returned as 0, so dimension checks pass
			expect(result.valid).toBe(true)
		})
	})
})

describe('ImageValidationError', () => {
	it('should have the correct name', () => {
		const err = new ImageValidationError('test error')
		expect(err.name).toBe('ImageValidationError')
		expect(err.message).toBe('test error')
		expect(err).toBeInstanceOf(Error)
	})
})
