-- Alter "ReturnStatus" enum to add 'SHIPPED'
-- In SQLite, enums are text columns — no ALTER needed for the enum itself.
-- The Prisma schema already declares SHIPPED as a valid value.

-- Add shippedAt column to ReturnRequest
ALTER TABLE "ReturnRequest" ADD COLUMN "shippedAt" DATETIME;
