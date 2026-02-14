import db from "../db/init.js";
import parseOrderItems from "../parseOrderItems.js";
import { nowJST } from "../utils/time.js";
import { getRestockSuggestions as getSuggestions } from "../services/inventoryService.js";

const VALID_TABLES = ["members", "products", "purchases", "restock_history"];

function adjustProductStock(productId, delta, newPrice = null) {
  if (!productId || isNaN(delta)) return;
  db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(
    delta,
    productId
  );
  if (newPrice !== null && newPrice !== undefined && newPrice !== "") {
    const priceInt = Number(newPrice);
    if (!isNaN(priceInt)) {
      db.prepare(
        "UPDATE products SET price = ? WHERE id = ? AND price <> ?"
      ).run(priceInt, productId, priceInt);
    }
  }
}

export function getRestockSuggestions(req, res) {
  try {
    const result = getSuggestions({ db, query: req.query });
    res.json(result);
  } catch (e) {
    console.error(e);
    const status = e.statusCode ?? 500;
    const message = e.message ?? "候補の計算に失敗しました";
    res.status(status).json({ error: message });
  }
}

export function getInvoiceSummary(req, res) {
  try {
    const now = new Date();
    const year = req.query.year ?? now.getFullYear();
    const month = req.query.month ?? now.getMonth() + 1;
    const yStr = String(year);
    const mStr = String(month).padStart(2, "0");

    const stmt = db.prepare(`
      SELECT
        m.id   AS member_id,
        m.name AS member_name,
        COALESCE((
          SELECT SUM(pr.price)
          FROM purchases p
          JOIN products pr ON pr.id = p.product_id
          WHERE p.member_id = m.id
            AND strftime('%Y', p.timestamp) = ?
            AND strftime('%m', p.timestamp) = ?
        ), 0) AS settlement
      FROM members m
      ORDER BY m.id
    `);
    const rows = stmt.all(yStr, mStr);
    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "集計に失敗しました" });
  }
}

export function getTableColumns(req, res) {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const cols = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name);
    res.json({ columns: cols });
  } catch {
    res.status(500).json({ error: "列情報の取得に失敗しました" });
  }
}

export function getTableRows(req, res) {
  try {
    const { table } = req.params;
    const order = req.query.order === "desc" ? "DESC" : "ASC";
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const rows = db
      .prepare(`SELECT * FROM ${table} ORDER BY id ${order}`)
      .all();
    res.json({ rows });
  } catch {
    res.status(500).json({ error: "取得失敗" });
  }
}

export function createTableRow(req, res) {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const row = { ...req.body };

    if (table === "restock_history") {
      const qty = Number(row.quantity ?? 0);
      let pid = row.product_id ? Number(row.product_id) : null;

      if (!pid && row.barcode) {
        const found = db
          .prepare("SELECT id FROM products WHERE barcode = ?")
          .get(row.barcode);
        if (found) pid = found.id;
      }
      if (!pid) {
        const info = db
          .prepare(
            "INSERT INTO products (name, price, stock, barcode) VALUES (?,?,?,?)"
          )
          .run(
            row.product_name ?? "新商品",
            row.price ?? 0,
            0,
            row.barcode ?? null
          );
        pid = info.lastInsertRowid;
      }

      adjustProductStock(pid, qty, row.price ?? null);
      row.product_id = pid;
    }

    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(",");
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`
    );
    const info = stmt.run(...cols.map((c) => row[c]));
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "追加失敗" });
  }
}

export function updateTableRow(req, res) {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const newRow = { ...req.body };

    if (table === "restock_history") {
      const oldRow = db
        .prepare("SELECT * FROM restock_history WHERE id = ?")
        .get(id);

      if (oldRow) {
        if (oldRow.product_id !== newRow.product_id) {
          adjustProductStock(oldRow.product_id, -oldRow.quantity);
          adjustProductStock(
            newRow.product_id,
            Number(newRow.quantity ?? 0),
            newRow.price ?? null
          );
        } else {
          const diff =
            Number(newRow.quantity ?? 0) - Number(oldRow.quantity ?? 0);
          adjustProductStock(newRow.product_id, diff, newRow.price ?? null);
        }
      }
    }

    const cols = Object.keys(newRow).filter((c) => c !== "id");
    const setStr = cols.map((c) => `${c}=?`).join(",");
    db.prepare(`UPDATE ${table} SET ${setStr} WHERE id=?`).run(
      ...cols.map((c) => newRow[c]),
      id
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "更新失敗" });
  }
}

export function deleteTableRow(req, res) {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "削除失敗" });
  }
}

export function importRestock(req, res) {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text が空です" });

  const items = parseOrderItems(text);
  if (items.length === 0)
    return res.status(400).json({ error: "商品が抽出できませんでした" });

  const ts = nowJST();
  const findProduct = db.prepare("SELECT id FROM products WHERE barcode = ?");
  const insertProduct = db.prepare(`
      INSERT INTO products (name, price, stock, barcode)
      VALUES (?, ?, ?, ?)
  `);
  const updateProduct = db.prepare(`
      UPDATE products SET price = ?, stock = stock + ? WHERE id = ?
  `);
  const insertRestock = db.prepare(`
      INSERT INTO restock_history
        (product_id, product_name, barcode, unit_price, price, quantity, subtotal, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    items.forEach((it) => {
      let prod = findProduct.get(it.barcode);
      let productId;
      if (prod) {
        updateProduct.run(it.price, it.quantity, prod.id);
        productId = prod.id;
      } else {
        const info = insertProduct.run(
          it.product_name,
          it.price,
          it.quantity,
          it.barcode
        );
        productId = info.lastInsertRowid;
      }

      insertRestock.run(
        productId,
        it.product_name,
        it.barcode,
        it.unit_price,
        it.price,
        it.quantity,
        it.subtotal,
        ts
      );
    });
  })();

  res.json({ ok: true, imported: items.length });
}
