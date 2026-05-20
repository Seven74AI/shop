#!/usr/bin/env node
/**
 * Daily LiteFS snapshot backup script.
 *
 * Usage: node scripts/backup-db.cjs
 *
 * Environment variables required:
 *   AWS_ACCESS_KEY_ID        S3 access key (Tigris)
 *   AWS_SECRET_ACCESS_KEY    S3 secret key (Tigris)
 *   AWS_REGION               S3 region (e.g. "auto" for Tigris)
 *   AWS_ENDPOINT_URL_S3      S3 endpoint URL (e.g. https://fly.storage.tigris.dev)
 *   BACKUP_BUCKET_NAME       S3 bucket for backups (e.g. "db-backups")
 *   DATABASE_PATH            Path to the SQLite database (e.g. /litefs/data/sqlite.db)
 *
 * Behavior:
 *   1. Export a consistent snapshot via `litefs export`
 *   2. Gzip the snapshot
 *   3. Upload to S3 under key `db-<ISO8601-date>.sqlite.gz`
 *   4. Prune backups older than 30 days
 */

const { execFileSync } = require('child_process')
const { createReadStream, createWriteStream, readFileSync, unlinkSync, statSync, existsSync } = require('fs')
const { createGzip } = require('zlib')
const { createHmac, createHash } = require('crypto')
const path = require('path')
const os = require('os')
const { pipeline } = require('stream/promises')

// --- Configuration ---

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_REGION = process.env.AWS_REGION || 'auto'
const AWS_ENDPOINT_URL_S3 = process.env.AWS_ENDPOINT_URL_S3
const BACKUP_BUCKET_NAME = process.env.BACKUP_BUCKET_NAME
const DATABASE_PATH = process.env.DATABASE_PATH || '/litefs/data/sqlite.db'
const MOCKS = process.env.MOCKS === 'true'
const RETENTION_DAYS = 30

// --- Helpers ---

function log(message) {
  const ts = new Date().toISOString()
  process.stderr.write(`[${ts}] ${message}\n`)
}

function sha256(message) {
  return createHash('sha256').update(message).digest('hex')
}

function hmacSha256(key, message) {
  return createHmac('sha256', key).update(message).digest()
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmacSha256(`AWS4${key}`, dateStamp)
  const kRegion = hmacSha256(kDate, regionName)
  const kService = hmacSha256(kRegion, serviceName)
  const kSigning = hmacSha256(kService, 'aws4_request')
  return kSigning
}

/**
 * Build a signed S3 request.
 */
function signRequest(method, bucket, key, options = {}) {
  const contentSha256 = options.body
    ? sha256(options.body)
    : 'UNSIGNED-PAYLOAD'

  const url = `${AWS_ENDPOINT_URL_S3}/${bucket}/${key}`
  const endpoint = new URL(url)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const headers = [
    `host:${endpoint.host}`,
    `x-amz-content-sha256:${contentSha256}`,
    `x-amz-date:${amzDate}`,
  ]

  const canonicalHeaders = headers.join('\n') + '\n'
  const signedHeaders = headers.map((h) => h.split(':')[0]).join(';')

  const canonicalRequest = [
    method,
    `/${bucket}/${key}`,
    '', // canonicalQueryString
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')

  const signingKey = getSignatureKey(
    AWS_SECRET_ACCESS_KEY,
    dateStamp,
    AWS_REGION,
    's3',
  )
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex')

  return {
    url,
    headers: {
      Host: endpoint.host,
      'X-Amz-Date': amzDate,
      'X-Amz-Content-SHA256': contentSha256,
      Authorization: [
        `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(', '),
    },
  }
}

async function s3PutObject(bucket, key, body) {
  const { url, headers } = signRequest('PUT', bucket, key, { body })

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/gzip',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(
      `S3 PUT failed: ${response.status} ${response.statusText} (key: ${key})`,
    )
  }

  return key
}

/**
 * Delete a batch of backup keys. Since we know the exact key format
 * (db-YYYY-MM-DD.sqlite.gz), we generate keys for dates older than cutoff
 * and attempt deletion. 404 responses are silently ignored (idempotent).
 */
async function pruneOldBackups(bucket, cutoffDate) {
  // Generate keys for dates from cutoff-60 to cutoff-1
  // (covering a reasonable window of possible old backups)
  const cutoff = new Date(cutoffDate)
  // Start from 60 days before cutoff to catch any old stragglers
  const start = new Date(cutoff)
  start.setDate(start.getDate() - 60)

  let deletedCount = 0
  const current = new Date(start)
  while (current < cutoff) {
    const dateStr = current.toISOString().split('T')[0]
    const key = `db-${dateStr}.sqlite.gz`
    try {
      await s3DeleteObject(bucket, key)
      deletedCount++
      log(`  Deleted expired backup: ${key}`)
    } catch (err) {
      // 404 or other "doesn't exist" — skip
      // Re-throw unexpected errors
      if (!err.message?.includes('404')) {
        throw err
      }
    }
    current.setDate(current.getDate() + 1)
  }
  return deletedCount
}

async function s3DeleteObject(bucket, key) {
  const { url, headers } = signRequest('DELETE', bucket, key)

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  })

  // 204 No Content or 404 is success (idempotent)
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `S3 DELETE failed: ${response.status} ${response.statusText} (key: ${key})`,
    )
  }
}

// --- Main ---

async function main() {
  log('Starting database backup...')

  if (MOCKS) {
    log('🔶 MOCKS=true — simulating backup (no actual operations)')
    log('MOCK: litefs export → gzip → upload → prune')
    log('✅ Mock backup complete')
    return
  }

  // Validate required env vars
  const required = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT_URL_S3',
    'BACKUP_BUCKET_NAME',
  ]
  for (const name of required) {
    if (!process.env[name]) {
      log(`❌ Missing required environment variable: ${name}`)
      process.exit(1)
    }
  }

  // 1. Export snapshot via litefs export
  const tmpDir = os.tmpdir()
  const exportPath = path.join(tmpDir, 'litefs-export.sqlite')
  const gzipPath = path.join(tmpDir, 'backup.sqlite.gz')

  try {
    log('Exporting LiteFS snapshot...')
    // litefs export -name <dbname> <output-path>
    // DATABASE_FILENAME is extracted from DATABASE_PATH
    const dbFilename = path.basename(DATABASE_PATH)
    execFileSync('litefs', ['export', '-name', dbFilename, exportPath], {
      stdio: 'pipe',
      timeout: 120_000,
    })
    log(`Snapshot exported to ${exportPath} (${statSync(exportPath).size} bytes)`)

    // 2. Gzip
    log('Compressing with gzip...')
    await pipeline(
      createReadStream(exportPath),
      createGzip({ level: 9 }),
      createWriteStream(gzipPath),
    )

    // Clean up uncompressed export immediately
    unlinkSync(exportPath)
    log(`Gzip complete: ${gzipPath} (${statSync(gzipPath).size} bytes)`)

    // 3. Upload to S3
    const today = new Date().toISOString().split('T')[0]
    const key = `db-${today}.sqlite.gz`
    log(`Uploading to s3://${BACKUP_BUCKET_NAME}/${key}...`)

    const gzipData = readFileSync(gzipPath)
    await s3PutObject(BACKUP_BUCKET_NAME, key, gzipData)
    log(`✅ Uploaded ${key} (${gzipData.length} bytes)`)

    // Clean up gzip
    unlinkSync(gzipPath)

    // 4. Prune old backups (>30 days)
    log(`Pruning backups older than ${RETENTION_DAYS} days...`)

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    const deletedCount = await pruneOldBackups(BACKUP_BUCKET_NAME, cutoffDate)

    if (deletedCount > 0) {
      log(`🗑️  Pruned ${deletedCount} expired backup(s)`)
    } else {
      log('No expired backups to prune')
    }

    log('✅ Backup complete')
  } catch (error) {
    log(`❌ Backup failed: ${error.message}`)
    // Clean up temp files
    if (existsSync(exportPath)) unlinkSync(exportPath)
    if (existsSync(gzipPath)) unlinkSync(gzipPath)
    process.exit(1)
  }
}

main()
