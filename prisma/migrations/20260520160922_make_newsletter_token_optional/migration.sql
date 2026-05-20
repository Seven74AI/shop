-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsletterSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT,
    "tokenExpiresAt" DATETIME,
    "confirmedAt" DATETIME,
    "unsubscribedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NewsletterSubscription" ("confirmedAt", "createdAt", "email", "id", "status", "token", "tokenExpiresAt", "unsubscribedAt", "updatedAt") SELECT "confirmedAt", "createdAt", "email", "id", "status", "token", "tokenExpiresAt", "unsubscribedAt", "updatedAt" FROM "NewsletterSubscription";
DROP TABLE "NewsletterSubscription";
ALTER TABLE "new_NewsletterSubscription" RENAME TO "NewsletterSubscription";
CREATE UNIQUE INDEX "NewsletterSubscription_email_key" ON "NewsletterSubscription"("email");
CREATE UNIQUE INDEX "NewsletterSubscription_token_key" ON "NewsletterSubscription"("token");
CREATE INDEX "NewsletterSubscription_email_idx" ON "NewsletterSubscription"("email");
CREATE INDEX "NewsletterSubscription_status_idx" ON "NewsletterSubscription"("status");
CREATE INDEX "NewsletterSubscription_token_idx" ON "NewsletterSubscription"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
