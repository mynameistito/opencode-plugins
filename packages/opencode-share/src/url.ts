/** Construct the fragment-only-key share URL. */
export const shareUrl = (endpoint: string, id: string, key: string): string =>
  `${endpoint.replace(/\/$/u, "")}/s/${encodeURIComponent(id)}#${key}`;
