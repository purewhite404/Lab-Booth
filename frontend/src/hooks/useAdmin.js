import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMembers } from "../api/shopApi";
import { fetchInvoiceSummary, fetchRestockSuggestions } from "../api/adminApi";

const DEFAULT_RESTOCK_PARAMS = {
  days: 45,
  targetDays: 30,
  safetyDays: 10,
  minSold: 1,
};

export default function useAdmin({ token, mode = "all", initialRestockParams } = {}) {
  const restockEnabled = mode === "all" || mode === "restock";
  const invoiceEnabled = mode === "all" || mode === "invoice";

  const [restockItems, setRestockItems] = useState([]);
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError] = useState("");
  const [restockParams, setRestockParams] = useState(
    initialRestockParams || DEFAULT_RESTOCK_PARAMS
  );
  const restockParamsRef = useRef(restockParams);

  useEffect(() => {
    restockParamsRef.current = restockParams;
  }, [restockParams]);

  const refreshRestock = useCallback(async () => {
    if (!restockEnabled) return;
    try {
      setRestockLoading(true);
      setRestockError("");
      const suggestions = await fetchRestockSuggestions(
        restockParamsRef.current,
        token
      );
      setRestockItems(suggestions);
    } catch (err) {
      setRestockError(err?.message || "取得に失敗しました");
    } finally {
      setRestockLoading(false);
    }
  }, [restockEnabled, token]);

  useEffect(() => {
    if (restockEnabled) {
      refreshRestock();
    }
  }, [restockEnabled, refreshRestock]);

  const now = useMemo(() => new Date(), []);
  const [ym, setYm] = useState(
    `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`
  );
  const [invoiceRows, setInvoiceRows] = useState([]);

  useEffect(() => {
    if (!invoiceEnabled) return;
    const isValidYm = /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
    if (!isValidYm) return;

    (async () => {
      const [year, month] = ym.split("-").map(Number);
      try {
        const members = await fetchMembers();
        const settlements = await fetchInvoiceSummary(year, month, token);
        setInvoiceRows(
          members.map((m) => {
            const s = settlements.find((x) => x.member_id === m.id);
            return {
              id: m.id,
              name: m.name,
              adjust: "",
              settlement: s ? s.settlement : 0,
            };
          })
        );
      } catch (err) {
        console.error(err);
        setInvoiceRows([]);
      }
    })();
  }, [invoiceEnabled, token, ym]);

  const handleInvoiceChange = useCallback((idx, key, val) => {
    setInvoiceRows((rs) => {
      const cp = [...rs];
      cp[idx][key] = val;
      return cp;
    });
  }, []);

  const handlePasteAdjust = useCallback((startIdx, e) => {
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    e.preventDefault();

    const toHalfWidth = (str) =>
      str
        .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, " ");
    const normalizeNumber = (s) => {
      if (s == null) return "";
      let t = toHalfWidth(String(s)).trim();
      if (!t) return "";
      t = t.replace(/^[−‐‑‒–—―－ー]/, "-");
      t = t.replace(/[¥$,\s]/g, "").replace(/[円]/g, "");
      t = t.replace(/^\+/, "");
      const num = Number(t);
      if (Number.isNaN(num)) return "";
      return String(num);
    };

    const lines = text
      .split(/\r?\n/)
      .filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
    setInvoiceRows((rs) => {
      const cp = [...rs];
      for (let i = 0; i < lines.length && startIdx + i < cp.length; i++) {
        const cell = lines[i].split("\t")[0];
        cp[startIdx + i].adjust = normalizeNumber(cell);
      }
      return cp;
    });
  }, []);

  const toNum = useCallback((v) => (isNaN(Number(v)) ? 0 : Number(v)), []);

  const computedRows = useMemo(
    () =>
      invoiceRows.map((r) => {
        const bal = -toNum(r.adjust) + r.settlement;
        return {
          ...r,
          invoice: bal < 0 ? 0 : bal,
          nextAdvance: bal < 0 ? -bal : 0,
        };
      }),
    [invoiceRows, toNum]
  );

  const downloadCSV = useCallback(() => {
    if (!invoiceEnabled) return;
    const [y, mStr] = ym.split("-");
    const m = parseInt(mStr, 10);
    const head = [
      "名前",
      "繰越/前払い(±)",
      `${m}月清算分`,
      `${m}月請求額`,
      "次回前払い",
    ];
    const body = computedRows
      .map((r) =>
        [r.name, r.adjust || 0, r.settlement, r.invoice, r.nextAdvance].join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + head.join(",") + "\n" + body], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `invoice_${y}_${m}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  }, [computedRows, invoiceEnabled, ym]);

  const printInvoice = useCallback(() => {
    if (!invoiceEnabled) return;
    const [y, mStr] = ym.split("-");
    const m = parseInt(mStr, 10);
    const today = new Date();
    const todayStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>請求書 ${y}/${m}</title>
        <style>
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

          :root {
            --accent: #FFF4DF;
            --border: #BDBDBD;
            --stripe: #FAFAFA;
          }
          body {
            margin: 0;
            padding: 48px 40px 56px;
            font-family: "Noto Sans JP", sans-serif;
            color: #212121;
            line-height: 1.65;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 32px;
            font-weight: 700;
            text-align: center;
            color: #333;
          }

          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            margin-top: 24px;
          }
          th, td {
            padding: 6px 8px;
            font-size: 14px;
            text-align: right;
            border-right: 1px solid var(--border);
            border-bottom: 1px solid var(--border);
          }
          thead th { font-size: 14px; }
          th:last-child, td:last-child { border-right: none; }
          th:first-child, td:first-child { text-align: left; border-left: none; }
          thead { background: #F3F4F6; font-weight: 600; }
          tbody tr:nth-child(odd)  { background: var(--stripe); }
          tbody tr:nth-child(even) { background: #FFF; }

          th.invoice, td.invoice {
            background: var(--accent) !important;
            font-weight: 700;
            color: #000;
          }
          th.settlement, td.settlement { font-weight: 600; }

          footer { margin-top: 28px; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>商店</h1>
        <p>本日付けで商店の精算を行いましたので、ご確認のほどよろしくお願いいたします。　${todayStr}</p>
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th>繰越</th>
              <th class="settlement">${m}月清算分</th>
              <th>前払い</th>
              <th class="invoice">${m}月請求額</th>
              <th>次回前払い</th>
            </tr>
          </thead>
          <tbody>
            ${computedRows
              .map(
                (r) => `
              <tr>
                <td>${r.name}</td>
                <td>${Number(r.adjust) < 0 ? Math.abs(Number(r.adjust)) : 0}</td>
                <td class="settlement">${r.settlement}</td>
                <td>${Number(r.adjust) > 0 ? Number(r.adjust) : 0}</td>
                <td class="invoice">${r.invoice}</td>
                <td>${r.nextAdvance}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>

        <footer>
          <p>気になることがございましたら、商店係までよろしくお願いいたします。</p>
        </footer>
      </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed",
      top: "-9999px",
      width: "0",
      height: "0",
      visibility: "hidden",
    });
    iframe.srcdoc = html;
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1500);
    };
    document.body.appendChild(iframe);
  }, [computedRows, invoiceEnabled, ym]);

  const displayMonth = useMemo(() => {
    const [, mStr] = ym.split("-");
    return parseInt(mStr, 10);
  }, [ym]);

  return {
    restock: {
      items: restockItems,
      loading: restockLoading,
      error: restockError,
      params: restockParams,
      setParams: setRestockParams,
      refresh: refreshRestock,
    },
    invoice: {
      ym,
      setYm,
      rows: invoiceRows,
      computedRows,
      handleChange: handleInvoiceChange,
      handlePasteAdjust,
      downloadCSV,
      printInvoice,
      displayMonth,
    },
  };
}
