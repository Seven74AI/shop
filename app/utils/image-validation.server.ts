import { type FileUpload } from '@mjackson/form-data-parser'

/**
 * Magic byte signatures for common image formats.
 * Each format maps to its expected leading bytes.
 */
export const MAGIC_BYTES: Record<string, { bytes: number[]; description: string }> = {
	'image/jpeg': {
		bytes: [0xff, 0xd8, 0xff],
		description: 'JPEG',
	},
	'image/png': {
		bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
		description: 'PNG',
	},
	'image/gif': {
		bytes: [0x47, 0x49, 0x46, 0x38],
		description: 'GIF',
	},
	'image/webp': {
		bytes: [0x52, 0x49, 0x46, 0x46],
		description: 'WebP (RIFF header)',
	},
	'image/avif': {
		bytes: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
		description: 'AVIF',
	},
}

export interface ImageValidationOptions {
	/** Maximum width in pixels. Files exceeding this are rejected. */
	maxWidth?: number
	/** Maximum height in pixels. Files exceeding this are rejected. */
	maxHeight?: number
	/** List of allowed MIME types. If empty, all supported types are allowed. */
	allowedTypes?: string[]
	/** Whether to strip EXIF/metadata (default: true). */
	stripExif?: boolean
	/** Maximum file size in bytes. */
	maxFileSize?: number
}

export interface ImageValidationResult {
	valid: boolean
	error?: string
	/** The processed buffer (EXIF-stripped, if applicable). */
	buffer?: Buffer
	/** Detected image dimensions. */
	width?: number
	height?: number
	/** Detected MIME type from magic bytes. */
	detectedType?: string
}

/**
 * Error class for image validation failures.
 */
export class ImageValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ImageValidationError'
	}
}

/**
 * Read the first N bytes of a file and verify they match the expected magic bytes
 * for the file's declared MIME type.
 *
 * This prevents MIME-type spoofing attacks where an attacker uploads a
 * malicious file with a fake extension/content-type.
 */
export async function verifyMagicBytes(file: File | FileUpload): Promise<boolean> {
	const buffer = Buffer.from(await file.slice(0, 16).arrayBuffer())

	// SVG files don't have binary magic bytes — they start with XML/HTML
	if (file.type === 'image/svg+xml') {
		const header = buffer.toString('utf-8').trim().toLowerCase()
		return header.startsWith('<?xml') || header.startsWith('<svg') || header.startsWith('<!doctype')
	}

	const expected = MAGIC_BYTES[file.type]
	if (!expected) {
		// Unknown MIME type — reject
		return false
	}

	for (let i = 0; i < expected.bytes.length; i++) {
		if (buffer[i] !== expected.bytes[i]) {
			return false
		}
	}

	return true
}

/**
 * Strip EXIF and other metadata from an image buffer using sharp.
 * Returns a clean image buffer with no embedded metadata.
 *
 * Relies on sharp being installed as a dependency.
 */
export async function stripExif(buffer: Buffer): Promise<Buffer> {
	// Dynamic import so tests can mock sharp
	const sharp = (await import('sharp')).default
	return sharp(buffer).rotate().toBuffer()
}

/**
 * Get image dimensions from a buffer using sharp.
 */
export async function getImageDimensions(
	buffer: Buffer,
): Promise<{ width: number; height: number }> {
	const sharp = (await import('sharp')).default
	const metadata = await sharp(buffer).metadata()
	return {
		width: metadata.width ?? 0,
		height: metadata.height ?? 0,
	}
}

/**
 * Validate and process an uploaded image file.
 *
 * Performs three security checks:
 * 1. Magic-byte verification — ensures the file content matches the declared MIME type
 * 2. EXIF stripping — removes embedded metadata that could leak user information
 * 3. Dimension limits — rejects images that exceed maximum width/height
 *
 * In MOCKS mode, only performs basic file-size validation and skips actual processing.
 */
export async function validateImage(
	file: File | FileUpload,
	options: ImageValidationOptions = {},
): Promise<ImageValidationResult> {
	const {
		maxWidth,
		maxHeight,
		allowedTypes,
		stripExif: shouldStripExif = true,
		maxFileSize,
	} = options

	// 0. File size check (always performed, even in mocks)
	if (maxFileSize && file.size > maxFileSize) {
		return {
			valid: false,
			error: `File size ${file.size} exceeds maximum allowed size of ${maxFileSize} bytes`,
		}
	}

	// 1. MIME type whitelist
	if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
		return {
			valid: false,
			error: `File type "${file.type}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
		}
	}

	// 2. Magic byte verification
	const magicBytesValid = await verifyMagicBytes(file)
	if (!magicBytesValid) {
		return {
			valid: false,
			error: `File content does not match declared type "${file.type}". Magic byte verification failed.`,
		}
	}

	// In mocks mode, skip actual image processing
	if (process.env.MOCKS === 'true') {
		console.info('🔶 Mocking image validation for:', file.name)
		return {
			valid: true,
			width: 0,
			height: 0,
			detectedType: file.type,
		}
	}

	// 3. Process the image: read buffer, strip EXIF, check dimensions
	const originalBuffer = Buffer.from(await file.arrayBuffer())

	// Check dimensions
	const { width, height } = await getImageDimensions(originalBuffer)

	if (maxWidth && width > maxWidth) {
		return {
			valid: false,
			error: `Image width ${width}px exceeds maximum allowed width of ${maxWidth}px`,
			width,
			height,
		}
	}

	if (maxHeight && height > maxHeight) {
		return {
			valid: false,
			error: `Image height ${height}px exceeds maximum allowed height of ${maxHeight}px`,
			width,
			height,
		}
	}

	// Strip EXIF if requested
	let processedBuffer = originalBuffer
	if (shouldStripExif) {
		processedBuffer = await stripExif(originalBuffer)
	}

	return {
		valid: true,
		buffer: processedBuffer,
		width,
		height,
		detectedType: file.type,
	}
}
