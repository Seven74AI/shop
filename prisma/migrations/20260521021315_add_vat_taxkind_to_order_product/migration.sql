-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "country" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NewsletterSubscription" (
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

-- CreateTable
CREATE TABLE "Flag" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER DEFAULT 0,
    "audience" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "recoveryEmailSentAt" DATETIME,
    "recoveryEmailCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Cart" ("createdAt", "id", "sessionId", "updatedAt", "userId") SELECT "createdAt", "id", "sessionId", "updatedAt", "userId" FROM "Cart";
DROP TABLE "Cart";
ALTER TABLE "new_Cart" RENAME TO "Cart";
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");
CREATE INDEX "Cart_sessionId_idx" ON "Cart"("sessionId");
CREATE INDEX "Cart_updatedAt_idx" ON "Cart"("updatedAt");
CREATE INDEX "Cart_recoveryEmailSentAt_idx" ON "Cart"("recoveryEmailSentAt");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "shippingName" TEXT NOT NULL,
    "shippingStreet" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "shippingState" TEXT,
    "shippingPostal" TEXT NOT NULL,
    "shippingCountry" TEXT NOT NULL,
    "vatBreakdown" JSONB NOT NULL DEFAULT [],
    "vatTotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCountry" TEXT,
    "customerVatNumber" TEXT,
    "vatValidationStatus" TEXT,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "trackingNumber" TEXT,
    "shippingMethodId" TEXT,
    "shippingCost" INTEGER NOT NULL DEFAULT 0,
    "shippingMethodName" TEXT,
    "shippingCarrierName" TEXT,
    "mondialRelayPickupPointId" TEXT,
    "mondialRelayPickupPointName" TEXT,
    "mondialRelayShipmentNumber" TEXT,
    "mondialRelayLabelUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "email", "id", "mondialRelayLabelUrl", "mondialRelayPickupPointId", "mondialRelayPickupPointName", "mondialRelayShipmentNumber", "orderNumber", "shippingCarrierName", "shippingCity", "shippingCost", "shippingCountry", "shippingMethodId", "shippingMethodName", "shippingName", "shippingPostal", "shippingState", "shippingStreet", "status", "stripeChargeId", "stripeCheckoutSessionId", "stripePaymentIntentId", "subtotal", "total", "trackingNumber", "updatedAt", "userId") SELECT "createdAt", "email", "id", "mondialRelayLabelUrl", "mondialRelayPickupPointId", "mondialRelayPickupPointName", "mondialRelayShipmentNumber", "orderNumber", "shippingCarrierName", "shippingCity", "shippingCost", "shippingCountry", "shippingMethodId", "shippingMethodName", "shippingName", "shippingPostal", "shippingState", "shippingStreet", "status", "stripeChargeId", "stripeCheckoutSessionId", "stripePaymentIntentId", "subtotal", "total", "trackingNumber", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_email_idx" ON "Order"("email");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_stripeCheckoutSessionId_idx" ON "Order"("stripeCheckoutSessionId");
CREATE INDEX "Order_stripePaymentIntentId_idx" ON "Order"("stripePaymentIntentId");
CREATE INDEX "Order_shippingMethodId_idx" ON "Order"("shippingMethodId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stockQuantity" INTEGER,
    "weightGrams" INTEGER,
    "taxKind" TEXT NOT NULL DEFAULT 'STANDARD',
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("categoryId", "createdAt", "description", "id", "name", "price", "sku", "slug", "status", "stockQuantity", "updatedAt", "weightGrams") SELECT "categoryId", "createdAt", "description", "id", "name", "price", "sku", "slug", "status", "stockQuantity", "updatedAt", "weightGrams" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_slug_idx" ON "Product"("slug");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaxRate_country_idx" ON "TaxRate"("country");

-- CreateIndex
CREATE INDEX "TaxRate_kind_idx" ON "TaxRate"("kind");

-- CreateIndex
CREATE INDEX "TaxRate_isActive_idx" ON "TaxRate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_country_kind_effectiveFrom_key" ON "TaxRate"("country", "kind", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_email_key" ON "NewsletterSubscription"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_token_key" ON "NewsletterSubscription"("token");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_email_idx" ON "NewsletterSubscription"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_status_idx" ON "NewsletterSubscription"("status");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_token_idx" ON "NewsletterSubscription"("token");
