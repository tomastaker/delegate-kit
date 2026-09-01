export class ShopError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
