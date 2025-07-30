// backend/src/index.js
import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import db from "./db/init.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import adminAuth from "./adminAuth.js";
import parseOrderItems from "./parseOrderItems.js";
import sharp from "sharp";

dotenv.config();
const app = express();
app.use(express.json());

/* ===== 共通ユーティリティ ===== */
function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 19).replace("T", " ");
}
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
const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(
      null,
      `product_${req.params.id || "upload"}_${Date.now()}${path.extname(
        file.originalname
      )}`
    ),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
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
app.post("/api/purchase", (req, res) => {
  try {
    const { memberId, productIds } = req.body;
    const ts = nowJST();

    const getMember = db.prepare("SELECT name FROM members WHERE id = ?");
    const getProduct = db.prepare("SELECT name FROM products WHERE id = ?");

    const memberRow = getMember.get(memberId);
    if (!memberRow)
      return res.status(400).json({ error: "不正な memberId です" });

    const insertPurchase = db.prepare(`
      INSERT INTO purchases
        (member_id, member_name, product_id, product_name, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare(`
      UPDATE products
      SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE 0 END
      WHERE id = ?
    `);

    db.transaction(() => {
      productIds.forEach((pid) => {
        const prodRow = getProduct.get(pid);
        if (!prodRow) throw new Error(`product_id=\${pid} が存在しません`);
        insertPurchase.run(
          memberId,
          memberRow.name,
          pid,
          prodRow.name,
          ts // ← JST で書き込み
        );
        updateStock.run(pid);
      });
      db.prepare("UPDATE products SET stock = 0 WHERE stock < 0").run();
    })();

    res.json({
      members: db.prepare("SELECT * FROM members").all(),
      products: db.prepare("SELECT * FROM products").all(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "購入処理に失敗しました" });
  }
});

/* ----- 画像アップロード API ----- */
app.post("/api/products/:id/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "画像がありません" });
    const id = Number(req.params.id);

    /* 旧画像を削除 */
    const cur = db.prepare("SELECT image FROM products WHERE id = ?").get(id);
    if (cur && cur.image) {
      const oldName = path.basename(cur.image);
      const oldPath = path.join(uploadDir, oldName);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (e) {
        console.error("旧画像の削除に失敗:", e.message);
      }
    }

    // 保存先ファイル名
    const filename = `product_${id}_${Date.now()}.jpg`;
    const outPath = path.join(uploadDir, filename);

    // sharpでリサイズ・圧縮して保存
    await sharp(req.file.path)
      .resize({ width: 600, height: 600, fit: "inside" })
      .jpeg({ quality: 70 })
      .toFile(outPath);

    // アップロードされた元ファイルを削除
    fs.unlinkSync(req.file.path);

    /* DB更新 */
    const publicPath = `/api/uploads/${filename}`;
    db.prepare("UPDATE products SET image = ? WHERE id = ?").run(
      publicPath,
      id
    );

    res.json({
      product: db.prepare("SELECT * FROM products WHERE id = ?").get(id),
    });
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
