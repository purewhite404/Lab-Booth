// backend/src/index.js
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import db from "./db/init.js";
import adminAuth from "./adminAuth.js";
import parseOrderItems from "./parseOrderItems.js";
import { PurchaseDeduplicator } from "./utils/dedup.js";
import { upload, uploadDir } from "./config/multer.js";
import { replaceProductImage } from "./services/imageService.js";
import { processPurchase } from "./services/purchaseService.js";
import { getRestockSuggestions } from "./services/inventoryService.js";

dotenv.config();
const app = express();
app.use(express.json());

/* ===== 多重送信（短時間の同一データ）対策 ===== */
const purchaseDedup = new PurchaseDeduplicator();
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

/* ===== 0. ログイン API ===== */
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, process.env.ADMIN_PASSWORD, {
      expiresIn: "7d",
    });
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid password" });
});

/* ===== 画像アップロード設定 ===== */
app.use("/api/uploads", express.static(uploadDir));

/* ───────── 一般利用 API ───────── */
app.get("/api/members", (_req, res) => {
  try {
    const members = db.prepare("SELECT * FROM members").all();
    res.json({ members });
  } catch {
    res.status(500).json({ error: "メンバー取得に失敗しました" });
  }
});
app.get("/api/products", (_req, res) => {
  try {
    const products = db.prepare("SELECT * FROM products").all();
    res.json({ products });
  } catch {
    res.status(500).json({ error: "商品取得に失敗しました" });
  }
});

/* ⭐ 購入確定エンドポイント ⭐ */
app.post("/api/purchase", async (req, res) => {
  try {
    const { memberId, productIds } = req.body;
    const result = await processPurchase({
      db,
      purchaseDedup,
      memberId,
      productIds,
    });
    res.json(result);
  } catch (e) {
    console.error(e);
    const status = e.statusCode ?? 500;
    const message = e.message ?? "購入処理に失敗しました";
    res.status(status).json({ error: message });
  }
});

/* ----- 画像アップロード API ----- */
app.post("/api/products/:id/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "画像がありません" });
    const id = Number(req.params.id);
    const product = await replaceProductImage({
      db,
      uploadDir,
      productId: id,
      tempPath: req.file.path,
    });

    res.json({ product });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "画像アップロードに失敗しました" });
  }
});

/* ----- multer サイズ超過 ----- */
app.use((err, _req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "画像が大きすぎます（最大10MB）" });
  }
  next(err);
});

/* ======== 🔐 管理者 API ======== */
const VALID_TABLES = ["members", "products", "purchases", "restock_history"];
app.use("/api/admin", adminAuth);

/* ===== 次買うべき候補（在庫・購買頻度ベース） ===== */
app.get("/api/admin/restock-suggestions", (req, res) => {
  try {
    const result = getRestockSuggestions({ db, query: req.query });
    res.json(result);
  } catch (e) {
    console.error(e);
    const status = e.statusCode ?? 500;
    const message = e.message ?? "候補の計算に失敗しました";
    res.status(status).json({ error: message });
  }
});

app.get("/api/admin/invoice-summary", (req, res) => {
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
});

/* ── 列情報取得 ───────── */
app.get("/api/admin/:table/columns", (req, res) => {
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
});
/* ──────────────────────────── */

/* --- 共通 CRUD --- */

/* 取得 */
app.get("/api/admin/:table", (req, res) => {
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
});

/* 追加 */
app.post("/api/admin/:table", (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const row = { ...req.body };

    if (table === "restock_history") {
      const qty = Number(row.quantity ?? 0);
      let pid = row.product_id ? Number(row.product_id) : null;

      /* 商品検索／新規作成 */
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
});

/* 更新 */
app.put("/api/admin/:table/:id", (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();
    const newRow = { ...req.body };

    if (table === "restock_history") {
      const oldRow = db
        .prepare("SELECT * FROM restock_history WHERE id = ?")
        .get(id);

      if (oldRow) {
        /* 商品IDが変わった場合 */
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
});

/* 削除 */
app.delete("/api/admin/:table/:id", (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.includes(table)) return res.status(404).end();

    if (table === "restock_history") {
      const oldRow = db
        .prepare("SELECT * FROM restock_history WHERE id = ?")
        .get(id);
      if (oldRow) adjustProductStock(oldRow.product_id, -oldRow.quantity);
    }

    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "削除失敗" });
  }
});

/* ---- 仕入れ登録インポート ---- */
app.post("/api/admin/restock/import", (req, res) => {
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
      /* 1. products テーブル */
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

      /* 2. restock_history へ挿入（JST タイムスタンプ付き） */
      insertRestock.run(
        productId,
        it.product_name,
        it.barcode,
        it.unit_price,
        it.price,
        it.quantity,
        it.subtotal,
        ts // ← JST
      );
    });
  })();

  res.json({ ok: true, imported: items.length });
});

/* サーバ起動 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Backend listening on http://localhost:${PORT}`)
);
