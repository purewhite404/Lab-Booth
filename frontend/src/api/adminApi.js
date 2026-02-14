import client from "./client";

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

export async function fetchRestockSuggestions(params, token) {
  try {
    const { data } = await client.get("/admin/restock-suggestions", {
      params,
      headers: authHeader(token),
    });
    return data.suggestions || [];
  } catch (err) {
    const message = err?.response?.data?.error || "取得に失敗しました";
    throw new Error(message);
  }
}

export async function fetchInvoiceSummary(year, month, token) {
  const { data } = await client.get("/admin/invoice-summary", {
    params: { year, month },
    headers: authHeader(token),
  });
  return data.rows;
}

export async function fetchTableColumns(table, token) {
  const { data } = await client.get(`/admin/${table}/columns`, {
    headers: authHeader(token),
  });
  return data.columns;
}

export async function fetchTableRows(table, order, token) {
  const { data } = await client.get(`/admin/${table}`, {
    params: { order },
    headers: authHeader(token),
  });
  return data.rows;
}

export async function createTableRow(table, body, token) {
  const { data } = await client.post(`/admin/${table}`, body, {
    headers: authHeader(token),
  });
  return data;
}

export async function updateTableRow(table, id, body, token) {
  const { data } = await client.put(`/admin/${table}/${id}`, body, {
    headers: authHeader(token),
  });
  return data;
}

export async function deleteTableRow(table, id, token) {
  const { data } = await client.delete(`/admin/${table}/${id}`, {
    headers: authHeader(token),
  });
  return data;
}

export async function importRestock(text, token) {
  const { data } = await client.post(
    "/admin/restock/import",
    { text },
    { headers: authHeader(token) }
  );
  return data;
}
