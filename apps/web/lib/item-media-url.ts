export function protectedItemMediaUrl(
  value: string | null | undefined,
): string | null | undefined {
  if (!value) return value;
  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/api/item-media/")
  ) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/item-media\/([^/]+)\/thumbnail$/);
    if (!match) return value;

    const proxy = new URL(
      `/api/item-media/${match[1]}/thumbnail`,
      "http://localhost",
    );
    parsed.searchParams.forEach((entry, key) => {
      proxy.searchParams.append(key, entry);
    });
    return `${proxy.pathname}${proxy.search}`;
  } catch {
    const match = value.match(/^\/item-media\/([^/]+)\/thumbnail(\?.*)?$/);
    if (!match) return value;
    return `/api/item-media/${match[1]}/thumbnail${match[2] ?? ""}`;
  }
}
