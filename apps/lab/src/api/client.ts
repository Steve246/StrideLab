export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
