export function samePersonClient(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const first = (s: string) => s.trim().toLowerCase().split(/\s+/)[0];
  return first(a) === first(b);
}

export function firstName(n?: string | null) {
  return (n || "").trim().split(/\s+/)[0] || "";
}
