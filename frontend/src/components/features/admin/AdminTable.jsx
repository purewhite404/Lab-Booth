// frontend/src/components/features/admin/AdminTable.jsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { TableVirtuoso } from "react-virtuoso";
import ScrollContainer from "../../ui/ScrollContainer";
import {
  createTableRow,
  deleteTableRow,
  fetchTableColumns,
  fetchTableRows,
  updateTableRow,
} from "../../../api/adminApi";

/* ★ JST タイムスタンプを返すユーティリティ */
const jstNow = () => {
  const dt = new Date();
  const jst = new Date(dt.getTime() + 9 * 60 * 60 * 1000); // UTC→JST
  return jst.toISOString().slice(0, 19).replace("T", " "); // 'YYYY-MM-DD HH:mm:ss'
};

/* 行オブジェクトを編集用に整形 */
function editableCopy(row) {
  const copy = {};
  Object.entries(row).forEach(([k, v]) => (copy[k] = v ?? ""));
  return copy;
}

const AdminTable = forwardRef(({ table, token }, ref) => {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [order, setOrder] = useState("desc");
  const [dirty, setDirty] = useState({});
  const [deleted, setDeleted] = useState(new Set());
  const [newRows, setNewRows] = useState([]);

  const tableData = useMemo(
    () => [
      ...rows.map((row, idx) => ({ kind: "existing", row, idx })),
      ...newRows.map((row, idx) => ({ kind: "new", row, idx })),
    ],
    [rows, newRows]
  );

  /* 列情報取得 */
  const fetchColumns = useCallback(async () => {
    if (!table) return;
    const fetchedColumns = await fetchTableColumns(table, token);
    setColumns(fetchedColumns || []);
  }, [table, token]);

  /* データ取得 */
  const fetchRows = useCallback(
    async (ord = order) => {
      if (!table) return;
      const fetchedRows = await fetchTableRows(table, ord, token);
      setRows(fetchedRows.map(editableCopy));
      setDirty({});
      setDeleted(new Set());
      setNewRows([]);
      /* 列が空なら schema から取得 */
      if (fetchedRows.length) setColumns(Object.keys(fetchedRows[0]));
      else await fetchColumns();
    },
    [table, order, token, fetchColumns]
  );

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /* セル編集 */
  const handleChange = (idx, key, value, isNew = false) => {
    if (isNew) {
      setNewRows((r) => {
        const cp = [...r];
        cp[idx][key] = value;
        return cp;
      });
    } else {
      const row = rows[idx];
      const edited = { ...row, [key]: value };
      setRows((rs) => {
        const cp = [...rs];
        cp[idx] = edited;
        return cp;
      });
      setDirty((d) => ({ ...d, [row.id]: edited }));
    }
  };

  /* 行削除トグル */
  const toggleDelete = (id) =>
    setDeleted((set) => {
      const cp = new Set(set);
      cp.has(id) ? cp.delete(id) : cp.add(id);
      return cp;
    });

  /* 🎯 新規行追加（timestamp は JST 自動入力） */
  const addRow = () => {
    const blank = {};
    columns.forEach((c) => {
      if (c !== "id") {
        blank[c] = c === "timestamp" ? jstNow() : "";
      }
    });
    setNewRows((r) => [...r, { __tempId: Date.now(), ...blank }]);
  };

  /* コミット */
  useImperativeHandle(ref, () => ({
    async commit() {
      /* 削除 */
      await Promise.all(
        Array.from(deleted).map((id) =>
          deleteTableRow(table, id, token)
        )
      );
      /* 更新 */
      await Promise.all(
        Object.values(dirty).map((row) =>
          updateTableRow(table, row.id, row, token)
        )
      );
      /* 追加 */
      await Promise.all(
        newRows.map(({ __tempId, ...body }) =>
          createTableRow(table, body, token)
        )
      );
      alert("👌 反映しました！（自動リロードします）");
      window.location.reload();
    },
  }));

  /* ----------- ヘルパ: セル描画 ----------- */
  const renderCells = (row, idx, isNewRow = false) =>
    columns.map((col) => (
      <td key={col} className="px-3 py-1">
        {col === "id" ? (
          isNewRow ? "NEW" : row[col]
        ) : (
          <input
            value={row[col] ?? ""}
            onChange={(e) =>
              handleChange(idx, col, e.target.value, isNewRow)
            }
            className="w-full bg-transparent border-b border-gray-600 focus:outline-none"
          />
        )}
      </td>
    ));

  /* ----------- 描画 ----------- */
  if (!columns.length) return <p className="text-gray-400">列情報を取得中…</p>;

  return (
    <ScrollContainer
      scrollable={false}
      bodyClassName="min-h-0"
      header={
        <button
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
          className="px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600"
        >
          🔃 {order === "asc" ? "昇順" : "降順"}
        </button>
      }
      footer={
        <button
          onClick={addRow}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500"
        >
          ➕ 行を追加
        </button>
      }
    >
      <TableVirtuoso
        data={tableData}
        style={{ height: "100%" }}
        fixedHeaderContent={() => (
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold">
                {c}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        )}
        itemContent={(_, item) => {
          if (item.kind === "new") {
            return (
              <>
                {renderCells(item.row, item.idx, true)}
                <td />
              </>
            );
          }

          const isDeleted = deleted.has(item.row.id);

          return (
            <>
              {renderCells(item.row, item.idx, false)}
              <td className="px-3 py-1 text-center">
                <button
                  onClick={() => toggleDelete(item.row.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  {isDeleted ? "↩️" : "🗑️"}
                </button>
              </td>
            </>
          );
        }}
        components={{
          Table: (props) => (
            <table {...props} className="min-w-full border-collapse" />
          ),
          TableHead: (props) => (
            <thead {...props} className="bg-gray-800 z-10" />
          ),
          TableRow: (props) => {
            const dataIndex = Number(
              props["data-index"] ?? props["data-item-index"]
            );
            const item = tableData[dataIndex];

            if (!item) return <tr {...props} />;

            if (item.kind === "new") {
              return <tr {...props} className="bg-emerald-900/30" />;
            }

            const isDeleted = deleted.has(item.row.id);
            const rowClass = isDeleted
              ? "bg-red-900/40 line-through"
              : item.idx % 2
              ? "bg-gray-800/50"
              : "";

            return <tr {...props} className={rowClass} />;
          },
        }}
      />
    </ScrollContainer>
  );
});

export default AdminTable;
