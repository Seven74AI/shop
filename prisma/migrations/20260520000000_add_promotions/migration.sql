-- AlterTable: Add promotion/discount fields to Order
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "promotionId" TEXT,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "shippingName" TEXT NOT NULL,
    "shippingStreet" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "shippingState" TEXT,
    "shippingPostal" TEXT NOT NULL,
    "shippingCountry" TEXT NOT NULL,
    "vatBreakdown" JSONB NOT NULL DEFAULT '[]',
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
    CONSTRAINT "Order_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Order" (
    "id", "orderNumber", "userId", "email", "subtotal", "total",
    "shippingName", "shippingStreet", "shippingCity", "shippingState",
    "shippingPostal", "shippingCountry",
    "vatBreakdown", "vatTotalCents", "taxCountry", "customerVatNumber", "vatValidationStatus",
    "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeChargeId",
    "status", "trackingNumber",
    "shippingMethodId", "shippingCost", "shippingMethodName", "shippingCarrierName",
    "mondialRelayPickupPointId", "mondialRelayPickupPointName",
    "mondialRelayShipmentNumber", "mondialRelayLabelUrl",
    "createdAt", "updatedAt"
) SELECT
    "id", "orderNumber", "userId", "email", "subtotal", "total",
    "shippingName", "shippingStreet", "shippingCity", "shippingState",
    "shippingPostal", "shippingCountry",
    "vatBreakdown", "vatTotalCents", "taxCountry", "customerVatNumber", "vatValidationStatus",
    "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeChargeId",
    "status", "trackingNumber",
    "shippingMethodId", "shippingCost", "shippingMethodName", "shippingCarrierName",
    "mondialRelayPickupPointId", "mondialRelayPickupPointName",
    "mondialRelayShipmentNumber", "mondialRelayLabelUrl",
    "createdAt", "updatedAt"
FROM "Order";

DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";

-- Recreate indexes on Order
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
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");
CREATE INDEX "Order_couponCode_idx" ON "Order"("couponCode");

-- Create Promotion table
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderAmount" INTEGER,
    "maxUses" INTEGER,
    "maxUsesPerUser" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Create indexes on Promotion
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
CREATE INDEX "Promotion_code_idx" ON "Promotion"("code");
CREATE INDEX "Promotion_isActive_idx" ON "Promotion"("isActive");
CREATE INDEX "Promotion_startsAt_idx" ON "Promotion"("startsAt");
CREATE INDEX "Promotion_expiresAt_idx" ON "Promotion"("expiresAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
