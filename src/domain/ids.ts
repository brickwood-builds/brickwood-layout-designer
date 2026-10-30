/** Permanent internal identifiers. Never derived from labels and never reused. */
export const newId = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();
