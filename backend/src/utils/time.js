export function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 19).replace("T", " ");
}

// JSTで現在から指定日数を引いたYYYY-MM-DD HH:mm:ssを返す
export function jstMinusDays(days) {
  const ms = Date.now() + 9 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
