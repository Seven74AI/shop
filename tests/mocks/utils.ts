import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fsExtra from 'fs-extra'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDirPath = path.join(__dirname, '..', 'fixtures')

export async function readFixture(subdir: string, name: string) {
	return fsExtra.readJSON(path.join(fixturesDirPath, subdir, `${name}.json`))
}

export async function createFixture(
	subdir: string,
	name: string,
	data: unknown,
) {
	const dir = path.join(fixturesDirPath, subdir)
	await fsExtra.ensureDir(dir)
	const filePath = path.join(dir, `./${name}.json`)
	await fsExtra.writeJSON(filePath, data)
	// fsync the file to ensure data is on disk before returning
	const fd = await fs.open(filePath, 'r')
	await fd.sync()
	await fd.close()
}

export const EmailSchema = z.object({
	to: z.string(),
	from: z.string(),
	subject: z.string(),
	text: z.string(),
	html: z.string(),
})

export async function writeEmail(rawEmail: unknown) {
	const email = EmailSchema.parse(rawEmail)
	await createFixture('email', email.to, email)
	return email
}

export async function requireEmail(recipient: string) {
	const email = await readEmail(recipient)
	if (!email) throw new Error(`Email to ${recipient} not found`)
	return email
}

export async function readEmail(recipient: string) {
	// Retry on JSON parse failure or transient I/O errors — the file may
	// not be fully flushed when a previous mock write just completed
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			const email = await readFixture('email', recipient)
			return EmailSchema.parse(email)
		} catch (error) {
			if (attempt < 4) {
				await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
				continue
			}
			console.error(`Error reading email`, error)
			return null
		}
	}
	return null
}

export function requireHeader(headers: Headers, header: string) {
	if (!headers.has(header)) {
		const headersString = JSON.stringify(
			Object.fromEntries(headers.entries()),
			null,
			2,
		)
		throw new Error(
			`Header "${header}" required, but not found in ${headersString}`,
		)
	}
	return headers.get(header)
}
