export type TOIMDevUIServerOptions = {
    wsPort?: number;
    uiPort?: number;
    uiDir: string;
    open?: boolean;
    /**
     * The interface both ports bind to. LOOPBACK BY DEFAULT: a tool that hands
     * out the application's entire data model has no business being reachable
     * from the café Wi-Fi, and `listen` without a host binds every interface.
     *
     * Set it — `'0.0.0.0'` — when the browser genuinely runs somewhere else: a
     * container, a VM, a phone. That is an opt-in to everyone who can route
     * there reading the model.
     */
    host?: string;
    /**
     * Page origins allowed onto the bridge and allowed to read `/api/inspect`,
     * on top of the loopback origins allowed by default.
     *
     * Exact origins (`'http://app.test:3000'`). Never `'*'`: with that on every
     * response, any page in any tab the developer has open can read every entity
     * of every registered collection.
     */
    allowedOrigins?: readonly string[];
};
