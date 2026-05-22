import { type FileUpload } from '@mjackson/form-data-parser'
import * as Sentry from '@sentry/react-router'
import sharp from 'sharp'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum file size for uploaded images (10MB) */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
/** Maximum file size for uploaded PDFs (20MB) */
export const MAX_PDF_SIZE = 20 * 1024 * 1024
/** Maximum file size for other file types (5MB) */
export const MAX_OTHER_SIZE = 5 * 1024 * 1024

/** Magic byte signatures used for file-type validation */
const MAGIC_SIGNATURES: Record<string, number[][]> = {
	'image/jpeg': [
		[0xff, 0xd8, 0xff],
	],
	'image/png': [
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	],
	'image/webp': [
		[0x52, 0x49, 0x46, 0x46], // RIFF
	],
	// Full WebP check: RIFF????WEBP — skip length bytes, look for WEBP at offset 8
	'image/gif': [
		[0x47, 0x49, 0x46, 0x38], // GIF8
	],
	'application/pdf': [
		[0x25, 0x50, 0x44, 0x46], // %PDF
	],
}

/** MIME types that we can strip EXIF from with sharp */
const STRIPPABLE_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
])

/** Mapping from MIME types to file size limits */
const SIZE_LIMITS: Record<string, number> = {
	'image/jpeg': MAX_IMAGE_SIZE,
	'image/png': MAX_IMAGE_SIZE,
	'image/webp': MAX_IMAGE_SIZE,
	'image/gif': MAX_IMAGE_SIZE,
	'application/pdf': MAX_PDF_SIZE,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerifyOptions {
	/** Override the default max image size */
	maxSizeImages?: number
	/** Override the default max PDF size */
	maxSizePdfs?: number
	/** Skip EXIF stripping (default: false = strip EXIF) */
	skipExifStrip?: boolean
}

export interface VerifyResult {
	/** Whether the file passed all checks */
	valid: boolean
	/** The sanitized buffer (EXIF-stripped for images, original for others) */
	sanitizedBuffer?: Buffer
	/** Human-readable error if validation failed */
	error?: string
	/** Detected MIME type from magic bytes */
	detectedType?: string
}

// ─── Magic-Byte Detection ───────────────────────────────────────────────────

/**
 * Detect the MIME type of a file by examining its magic bytes.
 *
 * Validates that the file contents match a known signature, not just
 * the claimed file extension or MIME type.
 */
export function detectTypeFromMagicBytes(buffer: Buffer): string | null {
	const head = buffer

	for (const [mimeType, signatures] of Object.entries(MAGIC_SIGNATURES)) {
		for (const sig of signatures) {
			if (sig.length > head.length) continue
			const matches = sig.every((byte, i) => head[i] === byte)

			if (matches) {
				// Special case: WebP needs WEBP at offset 8
				if (mimeType === 'image/webp') {
					if (head.length >= 12) {
						const webpTag = head.subarray(8, 12).toString()
						if (webpTag === 'WEBP') return mimeType
					}
					// Could also be a generic RIFF file; continue checking
					continue
				}
				return mimeType
			}
		}
	}

	return null
}

/**
 * Check if the claimed MIME type matches what the magic bytes say.
 * Returns the detected type, or null if no match.
 */
export function validateMagicBytes(
	buffer: Buffer,
	claimedType: string,
): { valid: boolean; detectedType: string | null } {
	const detected = detectTypeFromMagicBytes(buffer)
	if (!detected) {
		return { valid: false, detectedType: null }
	}
	return { valid: detected === claimedType, detectedType: detected }
}

// ─── Size Validation ────────────────────────────────────────────────────────

/**
 * Enforce file size limits based on detected content type.
 *
 * Limits:
 *   - Images (JPEG, PNG, WebP, GIF): 10 MB
 *   - PDFs: 20 MB
 *   - Everything else: 5 MB
 */
export function validateFileSize(
	buffer: Buffer,
	mimeType: string,
	maxImageSize = MAX_IMAGE_SIZE,
	maxPdfSize = MAX_PDF_SIZE,
): { valid: boolean; maxSize: number; actualSize: number } {
	const limit = SIZE_LIMITS[mimeType] ?? MAX_OTHER_SIZE
	// Apply overrides if they differ from defaults
	let maxSize = limit
	if (STRIPPABLE_MIME_TYPES.has(mimeType) && maxImageSize !== MAX_IMAGE_SIZE) {
		maxSize = maxImageSize
	}
	if (mimeType === 'application/pdf' && maxPdfSize !== MAX_PDF_SIZE) {
		maxSize = maxPdfSize
	}

	return {
		valid: buffer.length <= maxSize,
		maxSize,
		actualSize: buffer.length,
	}
}

// ─── EXIF Stripping ─────────────────────────────────────────────────────────

/**
 * Strip EXIF metadata (including GPS data) from an image, keeping
 * only the ICC color profile.
 *
 * Uses sharp's `.withMetadata({})` which strips all metadata except ICC.
 *
 * @param buffer - Raw image buffer
 * @returns Image buffer with EXIF/GPS metadata removed
 * @throws If sharp fails to process the image
 */
export async function stripExifMetadata(buffer: Buffer): Promise<Buffer> {
	try {
		let format: string | undefined
		try {
			const meta = await sharp(buffer).metadata()
			format = meta.format
		} catch {
			// sharp can't identify the format — return buffer as-is
			return buffer
		}

		// Re-encode to the same format to force metadata removal.
		// sharp's format methods (.jpeg(), .png(), .webp()) strip ALL metadata
		// by default — including EXIF, GPS, XMP, and ICC profile.
		// Note: .withMetadata({}) PRESERVES metadata in sharp v0.34.x, so we
		// deliberately do NOT call it.
		let pipeline = sharp(buffer)

		switch (format) {
			case 'jpeg':
				pipeline = pipeline.jpeg()
				break
			case 'png':
				pipeline = pipeline.png()
				break
			case 'webp':
				pipeline = pipeline.webp()
				break
			default:
				// Unknown format — return as-is (no stripping possible)
				return buffer
		}

		return await pipeline.toBuffer()
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'exif-strip' },
			extra: { bufferSize: buffer.length },
		})
		throw new Error(
			`Failed to strip EXIF metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}
}

// ─── Malware Scanning Hook ──────────────────────────────────────────────────

/**
 * Placeholder for malware/virus scanning.
 *
 * In production, this should be wired to ClamAV or a similar scanner.
 * For now, it's a pass-through that logs the intent.
 *
 * @param buffer - File buffer to scan
 * @returns true if clean, false if suspicious
 */
export async function scanForMalware(_buffer: Buffer): Promise<boolean> {
	// ── PLACEHOLDER ──
	// TODO: Integrate with ClamAV or a cloud scanning API
	//   const result = await clamav.scan(buffer)
	//   return result.isClean
	if (process.env.MOCKS === 'true') {
		console.info('🔶 Mocking malware scan (pass-through)')
	}
	return true
}

// ─── Main Verification Pipeline ─────────────────────────────────────────────

/**
 * Convert a File or FileUpload to a Buffer.
 */
async function fileToBuffer(file: File | FileUpload): Promise<Buffer> {
	if (file instanceof File) {
		const arrayBuffer = await file.arrayBuffer()
		return Buffer.from(arrayBuffer)
	}
	// FileUpload from @mjackson/form-data-parser
	const chunks: Buffer[] = []
	for await (const chunk of (file as FileUpload).stream()) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	}
	return Buffer.concat(chunks)
}

/**
 * Full upload verification pipeline:
 *   1. Read file into buffer
 *   2. Validate size limits
 *   3. Detect real MIME type via magic bytes
 *   4. Compare claimed vs detected type
 *   5. Strip EXIF/GPS from images
 *   6. Run malware scan hook
 *
 * @param file - The uploaded file (File or FileUpload)
 * @param options - Verification options
 * @returns VerifyResult with validation status and sanitized buffer
 */
export async function verifyUpload(
	file: File | FileUpload,
	options: VerifyOptions = {},
): Promise<VerifyResult> {
	const buffer = await fileToBuffer(file)
	const claimedType = file.type

	// Step 1: Validate file size
	const sizeCheck = validateFileSize(
		buffer,
		claimedType,
		options.maxSizeImages,
		options.maxSizePdfs,
	)

	if (!sizeCheck.valid) {
		const maxMB = (sizeCheck.maxSize / (1024 * 1024)).toFixed(1)
		const actualMB = (sizeCheck.actualSize / (1024 * 1024)).toFixed(1)
		return {
			valid: false,
			error: `File too large: ${actualMB}MB exceeds the ${maxMB}MB limit for ${claimedType}`,
			detectedType: undefined,
		}
	}

	// Step 2: Validate magic bytes
	const magicCheck = validateMagicBytes(buffer, claimedType)

	if (!magicCheck.valid) {
		const msg = magicCheck.detectedType
			? `File type mismatch: claimed '${claimedType}' but content is '${magicCheck.detectedType}'`
			: `Unrecognized file format: content does not match any known type (claimed '${claimedType}')`

		Sentry.captureMessage(msg, {
			level: 'warning',
			tags: { context: 'upload-verify' },
			extra: {
				claimedType,
				detectedType: magicCheck.detectedType ?? 'unknown',
				fileName: file.name,
			},
		})

		return {
			valid: false,
			error: msg,
			detectedType: magicCheck.detectedType ?? undefined,
		}
	}

	// Step 3: Strip EXIF/GPS from images (unless skipped)
	let sanitizedBuffer = buffer
	const detectedType = magicCheck.detectedType ?? claimedType

	if (!options.skipExifStrip && STRIPPABLE_MIME_TYPES.has(detectedType)) {
		try {
			sanitizedBuffer = await stripExifMetadata(buffer)
		} catch (error) {
			return {
				valid: false,
				error: `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`,
				detectedType,
			}
		}
	}

	// Step 4: Malware scan (placeholder)
	const isClean = await scanForMalware(sanitizedBuffer)
	if (!isClean) {
		Sentry.captureMessage('Malware detected in upload', {
			level: 'error',
			tags: { context: 'upload-verify', action: 'malware-block' },
			extra: { fileName: file.name, detectedType },
		})
		return {
			valid: false,
			error: 'File rejected by security scanner',
			detectedType,
		}
	}

	return {
		valid: true,
		sanitizedBuffer,
		detectedType,
	}
}
