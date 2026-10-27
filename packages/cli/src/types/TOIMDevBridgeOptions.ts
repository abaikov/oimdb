export type TOIMDevBridgeOptions = {
    wsPort: number;
    host: string;
    allowedOrigins: ReadonlySet<string>;
    /** Opens every line this bridge writes to stderr. */
    logPrefix: string;
    /** The command the operator would re-run with a different port. */
    portInUseHint: string;
    requestTimeoutMessage: string;
};
