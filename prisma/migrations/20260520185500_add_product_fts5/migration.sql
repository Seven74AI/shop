-- Create FTS5 virtual table for full-text product search
CREATE VIRTUAL TABLE product_fts USING fts5(
  name,
  description,
  categoryId UNINDEXED,
  price UNINDEXED,
  status UNINDEXED,
  content='Product',
  content_rowid='rowid'
);

-- Trigger: keep FTS5 index in sync on INSERT
CREATE TRIGGER product_fts_ai AFTER INSERT ON Product BEGIN
  INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
  VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
END;

-- Trigger: keep FTS5 index in sync on DELETE
CREATE TRIGGER product_fts_ad AFTER DELETE ON Product BEGIN
  INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
  VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
END;

-- Trigger: keep FTS5 index in sync on UPDATE
CREATE TRIGGER product_fts_au AFTER UPDATE ON Product BEGIN
  INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
  VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
  INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
  VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
END;

-- Populate FTS5 with existing products
INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
SELECT rowid, name, description, categoryId, price, status FROM Product;
