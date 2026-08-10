/** UUID + idempotency-key helpers (FRONTEND_DOCUMENTATION.md §7.2). */

export function uuidv4(): string {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) {
        return c.randomUUID();
    }
    // Fallback using getRandomValues
    const bytes = new Uint8Array(16);
    (c ?? ({ getRandomValues: (b: Uint8Array) => b.map(() => Math.floor(Math.random() * 256)) } as any)).getRandomValues(
        bytes
    );
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
        .slice(8, 10)
        .join('')}-${hex.slice(10, 16).join('')}`;
}

export function newIdempotencyKey(): string {
    return `pos-${uuidv4()}`;
}
