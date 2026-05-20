-- CreateTable
CREATE TABLE "AbandonedCartEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cartId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "recoveredAt" DATETIME,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbandonedCartEmail_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AbandonedCartEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCartEmail_token_key" ON "AbandonedCartEmail"("token");

-- CreateIndex
CREATE INDEX "AbandonedCartEmail_cartId_idx" ON "AbandonedCartEmail"("cartId");

-- CreateIndex
CREATE INDEX "AbandonedCartEmail_userId_idx" ON "AbandonedCartEmail"("userId");

-- CreateIndex
CREATE INDEX "AbandonedCartEmail_sentAt_idx" ON "AbandonedCartEmail"("sentAt");
