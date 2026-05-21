import { prisma } from '#app/utils/db.server.ts'

/**
 * Apply the FTS5 migration to the test database.
 * Sets up the FTS5 virtual table and triggers so Prisma operations
 * auto-sync the FTS5 index.
 */
export async function ensureFts5Migration() {
	// Check if FTS5 table already exists
	const tableResult = await prisma.$queryRawUnsafe<
		Array<{ name: string }>
	>(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='product_fts'`,
	)

	if (tableResult.length > 0) {
		try {
			await prisma.$queryRawUnsafe(
				`INSERT INTO product_fts(product_fts) VALUES('rebuild')`,
			)
		} catch {
			// rebuild might fail if content was already rebuilt — ignore
		}
		return
	}

	// Create FTS5 virtual table
	await prisma.$queryRawUnsafe(`
		CREATE VIRTUAL TABLE product_fts USING fts5(
			name,
			description,
			categoryId UNINDEXED,
			price UNINDEXED,
			status UNINDEXED,
			content='Product',
			content_rowid='rowid'
		)
	`)

	// Create INSERT trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_ai AFTER INSERT ON Product BEGIN
			INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
			VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
		END
	`)

	// Create DELETE trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_ad AFTER DELETE ON Product BEGIN
			INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
			VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
		END
	`)

	// Create UPDATE trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_au AFTER UPDATE ON Product BEGIN
			INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
			VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
			INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
			VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
		END
	`)

	// Populate FTS5 with existing products
	await prisma.$queryRawUnsafe(`
		INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
		SELECT rowid, name, description, categoryId, price, status FROM Product
	`)
}
