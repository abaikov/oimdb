const OIM_CORE_INSTANCE_KEY = Symbol.for('@oimdb/core');

export function registerOIMCoreInstance(coreInstance: object): void {
    const globalThisRecord = globalThis as Record<symbol, unknown>;
    const registeredCoreInstance = globalThisRecord[OIM_CORE_INSTANCE_KEY];
    if (registeredCoreInstance === undefined) {
        globalThisRecord[OIM_CORE_INSTANCE_KEY] = coreInstance;
        return;
    }
    if (registeredCoreInstance === coreInstance) return;
    throw new Error(
        '@oimdb/core is loaded twice in this process — usually `import` in one place and `require` '
        + 'in another, or two installed copies. Each copy keeps its own built-in defaults and '
        + 'its own classes, so services built by the two copies share nothing. Load @oimdb/core one way '
        + 'everywhere, including inside every @oimdb package.',
    );
}
