export const OIM_DEV_REGISTRY = {
    inspect: () => ({ collections: { cards: { count: 2 } }, computeds: { total: { status: 'fresh', value: 2 } } }),
    dumpString: () => 'cards: 2',
};
