import client from "./client";

export async function login(password) {
  try {
    const { data } = await client.post("/login", { password });
    return data.token;
  } catch {
    throw new Error("ログイン失敗");
  }
}
