-- Create FTS5 virtual table for product full-text search with faceted filter support
-- Uses external content table (Product) with triggers for automatic sync
CREATE VIRTUAL TABLE IF NOT EXISTS product_fts USING fts5(
  name,
  description,
  categoryId UNINDEXED,
  price UNINDEXED,
  status UNINDEXED,
  content='Product',
  content_rowid='rowid'
);

-- Trigger: INSERT on Product → INSERT into FTS5
CREATE TRIGGER IF NOT EXISTS product_fts_ai AFTER INSERT ON Product BEGIN
  INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
  VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
END;

-- Trigger: DELETE on Product → DELETE from FTS5
CREATE TRIGGER IF NOT EXISTS product_fts_ad AFTER DELETE ON Product BEGIN
  INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
  VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
END;

-- Trigger: UPDATE on Product → UPDATE in FTS5
CREATE TRIGGER IF NOT EXISTS product_fts_au AFTER UPDATE ON Product BEGIN
  INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
  VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
  INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
  VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
END;

-- Populate FTS5 table with existing products
INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
SELECT rowid, name, description, categoryId, price, status FROM Product;
