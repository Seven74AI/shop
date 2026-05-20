import { createHash, createHmac } from 'crypto'
import { type FileUpload } from '@mjackson/form-data-parser'
import { createId } from '@paralleldrive/cuid2'
import * as Sentry from '@sentry/react-router'
import sharp from 'sharp'

/** Magic byte signatures for supported image formats */
const IMAGE_SIGNATURES: Record<string, { bytes: number[]; offset?: number }> = {
	'image/jpeg': { bytes: [0xff, 0xd8, 0xff] },
	'image/png': { bytes: [0x89, 0x50, 0x4e, 0x47] },
	'image/gif': { bytes: [0x47, 0x49, 0x46, 0x38] },
	'image/webp': { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF container; also check WEBP at offset 8
}

/** Maximum image dimensions per upload context */
export const IMAGE_MAX_DIMENSIONS = {
	PROFILE_IMAGE: { width: 2000, height: 2000 },
	PRODUCT_IMAGE: { width: 4000, height: 4000 },
	NOTE_IMAGE: { width: 4000, height: 4000 },
} as const

export type ImageMaxDimensionKey = keyof typeof IMAGE_MAX_DIMENSIONS

/**
 * Verifies that a buffer contains a supported image format by checking magic bytes.
 * Returns the detected MIME type if valid.
 */
export function verifyImageMagicBytes(buffer: Buffer): {
	valid: boolean
	type?: string
} {
	if (buffer.length < 4) return { valid: false }

	for (const [mimeType, sig] of Object.entries(IMAGE_SIGNATURES)) {
		const offset = sig.offset ?? 0
		if (buffer.length < offset + sig.bytes.length) continue

		const matches = sig.bytes.every(
			(byte, i) => buffer[offset + i] === byte,
		)

		if (matches) {
			// WebP requires additional check: "WEBP" at offset 8
			if (mimeType === 'image/webp') {
				if (buffer.length < 12) continue
				const webpMagic = Buffer.from('WEBP')
				if (!buffer.subarray(8, 12).equals(webpMagic)) continue
			}
			return { valid: true, type: mimeType }
		}
	}

	return { valid: false }
}

/**
 * Strips EXIF metadata and enforces dimension limits on an uploaded image.
 * Returns a new File with the processed image data.
 * Uses sharp for all image processing.
 */
export async function processImageUpload(
	file: File | FileUpload,
	options?: {
		maxWidth?: number
		maxHeight?: number
	},
): Promise<File> {
	const buffer = Buffer.from(await file.arrayBuffer())

	// 1. Magic-byte verification
	const verification = verifyImageMagicBytes(buffer)
	if (!verification.valid) {
		throw new Error(
			`File is not a supported image type. ` +
				`Supported types: JPEG, PNG, GIF, WebP. ` +
				`Received: ${file.type || 'unknown'}`,
		)
	}

	// 2. Process with sharp: strip EXIF + resize if needed
	const maxWidth = options?.maxWidth
	const maxHeight = options?.maxHeight

	try {
		let pipeline = sharp(buffer)

		if (maxWidth || maxHeight) {
			pipeline = pipeline.resize({
				width: maxWidth,
				height: maxHeight,
				fit: 'inside',
				withoutEnlargement: true,
			})
		}

		// sharp strips EXIF metadata by default
		const processedBuffer = await pipeline.toBuffer()

		// Return as new File, preserving original filename and detected type
		return new File([new Uint8Array(processedBuffer)], file.name, {
			type: verification.type ?? file.type,
		})
	} catch (sharpError) {
		throw new Error(
			`Failed to process image: ${sharpError instanceof Error ? sharpError.message : 'Unknown error'}`,
		)
	}
}

const STORAGE_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3
const STORAGE_BUCKET = process.env.BUCKET_NAME
const STORAGE_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID
const STORAGE_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY
const STORAGE_REGION = process.env.AWS_REGION

async function uploadToStorage(file: File | FileUpload, key: string) {
	// In mocks mode, skip actual upload
	if (process.env.MOCKS === 'true') {
		console.info('🔶 Mocking storage upload:', key)
		return key
	}

	const { url, headers } = getSignedPutRequestInfo(file, key)

	const uploadResponse = await fetch(url, {
		method: 'PUT',
		headers,
		body: file instanceof File ? file : (file as FileUpload).stream(),
	})

	if (!uploadResponse.ok) {
		const errorMessage = `Failed to upload file to storage. Server responded with ${uploadResponse.status}: ${uploadResponse.statusText}`
		Sentry.captureException(new Error(errorMessage), {
			tags: { context: 'storage-upload' },
			extra: { key, status: uploadResponse.status, statusText: uploadResponse.statusText },
		})
		throw new Error(`Failed to upload object: ${key}`)
	}

	return key
}

export async function uploadProfileImage(
	userId: string,
	file: File | FileUpload,
) {
	const processedFile = await processImageUpload(file, {
		maxWidth: IMAGE_MAX_DIMENSIONS.PROFILE_IMAGE.width,
		maxHeight: IMAGE_MAX_DIMENSIONS.PROFILE_IMAGE.height,
	})
	const fileId = createId()
	const fileExtension = processedFile.name.split('.').pop() || ''
	const timestamp = Date.now()
	const key = `users/${userId}/profile-images/${timestamp}-${fileId}.${fileExtension}`
	return uploadToStorage(processedFile, key)
}

export async function uploadNoteImage(
	userId: string,
	noteId: string,
	file: File | FileUpload,
) {
	const processedFile = await processImageUpload(file, {
		maxWidth: IMAGE_MAX_DIMENSIONS.NOTE_IMAGE.width,
		maxHeight: IMAGE_MAX_DIMENSIONS.NOTE_IMAGE.height,
	})
	const fileId = createId()
	const fileExtension = processedFile.name.split('.').pop() || ''
	const timestamp = Date.now()
	const key = `users/${userId}/notes/${noteId}/images/${timestamp}-${fileId}.${fileExtension}`
	return uploadToStorage(processedFile, key)
}

export async function uploadProductImage(
	productId: string,
	file: File | FileUpload,
) {
	const processedFile = await processImageUpload(file, {
		maxWidth: IMAGE_MAX_DIMENSIONS.PRODUCT_IMAGE.width,
		maxHeight: IMAGE_MAX_DIMENSIONS.PRODUCT_IMAGE.height,
	})
	const fileId = createId()
	const fileExtension = processedFile.name.split('.').pop() || ''
	const timestamp = Date.now()
	const key = `products/${productId}/images/${timestamp}-${fileId}.${fileExtension}`
	return uploadToStorage(processedFile, key)
}

export async function uploadProductImages(
	productId: string,
	files: Array<File | FileUpload>,
) {
	const uploadPromises = files.map(file => uploadProductImage(productId, file))
	return Promise.all(uploadPromises)
}

function hmacSha256(key: string | Buffer, message: string) {
	const hmac = createHmac('sha256', key)
	hmac.update(message)
	return hmac.digest()
}

function sha256(message: string) {
	const hash = createHash('sha256')
	hash.update(message)
	return hash.digest('hex')
}

function getSignatureKey(
	key: string,
	dateStamp: string,
	regionName: string,
	serviceName: string,
) {
	const kDate = hmacSha256(`AWS4${key}`, dateStamp)
	const kRegion = hmacSha256(kDate, regionName)
	const kService = hmacSha256(kRegion, serviceName)
	const kSigning = hmacSha256(kService, 'aws4_request')
	return kSigning
}

function getBaseSignedRequestInfo({
	method,
	key,
	contentType,
	uploadDate,
}: {
	method: 'GET' | 'PUT' | 'DELETE'
	key: string
	contentType?: string
	uploadDate?: string
}) {
	const url = `${STORAGE_ENDPOINT}/${STORAGE_BUCKET}/${key}`
	const endpoint = new URL(url)

	// Prepare date strings
	const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
	const dateStamp = amzDate.slice(0, 8)

	// Build headers array conditionally
	const headers = [
		...(contentType ? [`content-type:${contentType}`] : []),
		`host:${endpoint.host}`,
		`x-amz-content-sha256:UNSIGNED-PAYLOAD`,
		`x-amz-date:${amzDate}`,
		...(uploadDate ? [`x-amz-meta-upload-date:${uploadDate}`] : []),
	]

	const canonicalHeaders = headers.join('\n') + '\n'
	const signedHeaders = headers.map((h) => h.split(':')[0]).join(';')

	const canonicalRequest = [
		method,
		`/${STORAGE_BUCKET}/${key}`,
		'', // canonicalQueryString
		canonicalHeaders,
		signedHeaders,
		'UNSIGNED-PAYLOAD',
	].join('\n')

	// Prepare string to sign
	const algorithm = 'AWS4-HMAC-SHA256'
	const credentialScope = `${dateStamp}/${STORAGE_REGION}/s3/aws4_request`
	const stringToSign = [
		algorithm,
		amzDate,
		credentialScope,
		sha256(canonicalRequest),
	].join('\n')

	// Calculate signature
	const signingKey = getSignatureKey(
		STORAGE_SECRET_KEY,
		dateStamp,
		STORAGE_REGION,
		's3',
	)
	const signature = createHmac('sha256', signingKey)
		.update(stringToSign)
		.digest('hex')

	const baseHeaders = {
		'X-Amz-Date': amzDate,
		'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
		Authorization: [
			`${algorithm} Credential=${STORAGE_ACCESS_KEY}/${credentialScope}`,
			`SignedHeaders=${signedHeaders}`,
			`Signature=${signature}`,
		].join(', '),
	}

	return { url, baseHeaders }
}

function getSignedPutRequestInfo(file: File | FileUpload, key: string) {
	const uploadDate = new Date().toISOString()
	const { url, baseHeaders } = getBaseSignedRequestInfo({
		method: 'PUT',
		key,
		contentType: file.type,
		uploadDate,
	})

	return {
		url,
		headers: {
			...baseHeaders,
			'Content-Type': file.type,
			'X-Amz-Meta-Upload-Date': uploadDate,
		},
	}
}

export function getSignedGetRequestInfo(key: string) {
	const { url, baseHeaders } = getBaseSignedRequestInfo({
		method: 'GET',
		key,
	})

	return {
		url,
		headers: baseHeaders,
	}
}

function getSignedDeleteRequestInfo(key: string) {
	const { url, baseHeaders } = getBaseSignedRequestInfo({
		method: 'DELETE',
		key,
	})

	return {
		url,
		headers: baseHeaders,
	}
}

export async function deleteObjectFromStorage(objectKey: string): Promise<void> {
	const { url, headers } = getSignedDeleteRequestInfo(objectKey)

	const deleteResponse = await fetch(url, {
		method: 'DELETE',
		headers,
	})

	// Silently succeed if object doesn't exist (idempotent)
	if (!deleteResponse.ok && deleteResponse.status !== 404) {
		const errorMessage = `Failed to delete object from storage. Server responded with ${deleteResponse.status}: ${deleteResponse.statusText}`
		Sentry.captureException(new Error(errorMessage), {
			tags: { context: 'storage-delete' },
			extra: { objectKey, status: deleteResponse.status, statusText: deleteResponse.statusText },
		})
		throw new Error(`Failed to delete object: ${objectKey}`)
	}
}

export async function deleteProductImages(objectKeys: string[]): Promise<void> {
	const deletePromises = objectKeys.map(key => deleteObjectFromStorage(key))
	await Promise.all(deletePromises)
}
