-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INVOICE',
    "subtotalCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "vatBreakdown" JSONB NOT NULL DEFAULT [],
    "vatTotalCents" INTEGER NOT NULL DEFAULT 0,
    "parentInvoiceId" TEXT,
    "pdfObjectKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_fiscalYear_idx" ON "Invoice"("fiscalYear");

-- CreateIndex
CREATE INDEX "Invoice_fiscalYear_sequence_idx" ON "Invoice"("fiscalYear", "sequence");

-- CreateIndex
CREATE INDEX "Invoice_parentInvoiceId_idx" ON "Invoice"("parentInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_fiscalYear_sequence_key" ON "Invoice"("fiscalYear", "sequence");
