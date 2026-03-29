/** randomBytes(32).toString('hex') length */
export const RESET_TOKEN_HEX_LENGTH = 64;

function normalizeResetToken(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase();
}

/** Read ?reset= from normal query or from hash (e.g. #/?reset=…). */
export function readResetTokenFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const fromSearch = new URLSearchParams(window.location.search).get('reset')?.trim() || '';
  if (fromSearch) return normalizeResetToken(fromSearch);
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  if (qi >= 0) {
    const fromHash = new URLSearchParams(hash.slice(qi)).get('reset')?.trim() || '';
    if (fromHash) return normalizeResetToken(fromHash);
  }
  return '';
}

export function looksLikePasswordResetToken(t: string): boolean {
  return t.length === RESET_TOKEN_HEX_LENGTH && /^[0-9a-f]+$/i.test(t);
}
