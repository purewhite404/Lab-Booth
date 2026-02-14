// frontend/src/components/features/admin/InvoiceGenerator.jsx
import useAdmin from "../../../hooks/useAdmin";
import ScrollContainer from "../../ui/ScrollContainer";

export default function InvoiceGenerator({ token }) {
  const {
    invoice: {
      ym,
      setYm,
      rows,
      computedRows,
      handleChange,
      handlePasteAdjust,
      downloadCSV,
      printInvoice,
      displayMonth,
    },
  } = useAdmin({ token, mode: "invoice" });

  const m = displayMonth;
  return (
    <ScrollContainer
      header={
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col">
            <span className="font-semibold mb-1">対象年月 ⏰</span>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600"
            />
          </label>
          <button
            onClick={downloadCSV}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold"
          >
            📥 CSVダウンロード
          </button>
          <button
            onClick={printInvoice}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold"
          >
            🖨️ 印刷 / PDF保存
          </button>
        </div>
      }
    >
      <table className="min-w-full border-collapse">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left">名前</th>
              <th className="px-3 py-2">繰越/前払い(±)</th>
              <th className="px-3 py-2">{m}月清算分</th>
              <th className="px-3 py-2">{m}月請求額</th>
              <th className="px-3 py-2">次回前払い</th>
            </tr>
          </thead>
          <tbody>
            {computedRows.map((r, idx) => (
              <tr key={r.id} className={idx % 2 ? "bg-gray-800/50" : ""}>
                <td className="px-3 py-1 text-left">{r.name}</td>
                <td className="px-3 py-1">
                  <input
                    type="text"
                    value={r.adjust}
                    onChange={(e) => handleChange(idx, "adjust", e.target.value)}
                    onPaste={(e) => handlePasteAdjust(idx, e)}
                    className="w-full min-w-[4rem] bg-transparent border-b border-gray-600 text-right"
                    placeholder=""
                  />
                </td>
                <td className="px-3 py-1 text-right font-bold">
                  {r.settlement}
                </td>
                <td className="px-3 py-1 text-right font-bold bg-orange-600/20">
                  {r.invoice}
                </td>
                <td className="px-3 py-1 text-right">{r.nextAdvance}</td>
              </tr>
            ))}
          </tbody>
      </table>
    </ScrollContainer>
  );
}
