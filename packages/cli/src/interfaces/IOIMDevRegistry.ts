// Structural so `@oimdb/mcp` need not depend on `@oimdb/devtools`.
export interface IOIMDevRegistry {
    inspect(): unknown;
    dumpString(): string;
}
