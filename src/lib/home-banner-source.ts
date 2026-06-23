export function rotateBannerItems<T>(items: T[], offset = 5, limit = 5): T[] {
  if (items.length <= limit) {
    return items.slice(0, limit);
  }

  const normalizedOffset = Math.min(Math.max(0, offset), items.length - 1);
  return [
    ...items.slice(normalizedOffset),
    ...items.slice(0, normalizedOffset),
  ].slice(0, limit);
}
