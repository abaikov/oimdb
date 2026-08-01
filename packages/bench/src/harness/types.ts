/** The shared dataset every adapter stores. Deliberately dull: the store is what is under test. */
export type TUser = {
    id: string;
    teamId: string;
    name: string;
    active: boolean;
};

export type TComment = {
    id: string;
    userId: string;
    body: string;
};

export const makeUsers = (n: number): TUser[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `u${i}`,
        teamId: `t${i % 50}`,
        name: `name-${String(i).padStart(7, '0')}`,
        active: i % 3 === 0,
    }));

export const makeComments = (users: number, perUser: number): TComment[] => {
    const out: TComment[] = [];
    for (let u = 0; u < users; u++) {
        for (let c = 0; c < perUser; c++) {
            out.push({ id: `c${u}-${c}`, userId: `u${u}`, body: `body ${c}` });
        }
    }
    return out;
};

/**
 * A scenario an adapter can implement. `setup` is untimed; only `run` is measured.
 *
 * Returning `null` from an adapter for a scenario means "this library has no idiomatic way to do
 * this" — reported as unsupported rather than as a bad number, because forcing a library into a
 * shape its documentation never suggests measures nothing but our own inventiveness.
 */
export type TScenarioImpl = {
    setup: () => void;
    run: () => void;
    /** Optional check, run once outside timing, that the implementation actually did the work. */
    verify?: () => boolean;
    /**
     * The observable answer the scenario produced (a row count). The worker compares it against the
     * value derived from the dataset itself, so an adapter that quietly filters differently — or
     * returns three rows where the others return two hundred — fails loudly instead of posting a
     * flattering time. `verify` only ever proved "not empty"; this proves "correct".
     */
    result?: () => number;
};

/**
 * A reactive-graph measurement. The two counters are the point: a time on its own is not
 * explainable, but "one write recomputed 1 of 1000 derived values and woke 1 subscriber, in 800 ns"
 * is. Where a library recomputes more than it should, the counter says so before the clock does.
 */
export type TReactiveScenario = TScenarioImpl & {
    /** Derived values that actually recomputed for the change under test. */
    recomputes: () => number;
    /** Downstream subscribers (mounted "components") that were woken. */
    wakeups: () => number;
    /**
     * Times the node under test observed an INCONSISTENT combination of its inputs — a fresh direct
     * dependency next to a stale deep one. Any number above zero means the library let a torn state
     * become visible, which is worse than being slow: the value was briefly wrong.
     */
    inconsistencies?: () => number;
};

export type TMemoryImpl = {
    /** Must return the structure so it stays referenced while the heap is measured. */
    build: () => unknown;
};

export type TAdapter = {
    name: string;
    version: string;
    /** Where the idiomatic recipe came from — every implementation must cite one. */
    docs: string;

    /** Insert N users into an empty store. */
    load?: (users: TUser[]) => TScenarioImpl;
    /** Read one user by primary key, repeatedly, in a warm store. */
    readByPk?: (users: TUser[], reads: number) => TScenarioImpl;
    /** One subscriber per user; update ONE user; count how many subscribers woke. */
    pointUpdate?: (users: TUser[]) => TScenarioImpl & { woken: () => number };
    /**
     * All users of one team, COLD: something changed since the last query, so every library has to
     * recompute. This is the honest comparison of the query itself.
     */
    queryColdByField?: (users: TUser[], queries: number) => TScenarioImpl;
    /**
     * The same query with nothing changed, read LIVE — no memoisation anywhere. This is the cost of
     * the query itself, and it is the row that compares across libraries.
     */
    queryHotByField?: (users: TUser[], queries: number) => TScenarioImpl;
    /**
     * The same query again, this time through each library's own memoising primitive: `OIMComputed`
     * here, `createQueries` in TinyBase, a derived atom in Jotai, a live query in TanStack DB.
     * Kept separate because a cache hit and a live read are different questions, and putting them in
     * one row — which is what this benchmark did until now — compares one library's cache against
     * another's real work. Libraries with no such primitive report it as unsupported.
     */
    queryCachedByField?: (users: TUser[], queries: number) => TScenarioImpl;
    /** Comments of one user, through whatever relation mechanism the library offers. */
    relatedLookup?: (
        users: TUser[],
        comments: TComment[],
        queries: number
    ) => TScenarioImpl;

    /**
     * A chain of derived values: source → level 1 → level 2 → level 3. Change the source, read the
     * last level. Every UI has these — a row's label derived from an entity derived from a filter —
     * and what matters is whether one write walks the chain once or the whole graph.
     */
    computedChain?: (users: TUser[], updates: number) => TScenarioImpl;
    /**
     * One effect per entity, then change ONE entity: how many effects actually ran. The effect
     * analogue of the point-update scenario, and the thing that decides whether a page with a
     * thousand live widgets survives a single write.
     */
    effectDispatch?: (
        users: TUser[]
    ) => TScenarioImpl & { ran: () => number };
    /**
     * A server push writing 10% of the entities in one go — bulk-write throughput. Every write here
     * hits a DISTINCT entity, so one notification per write is the correct floor, not a defect; the
     * number to read is the time. Coalescing is measured by `burstCoalescing` instead.
     */
    batchUpdate?: (users: TUser[]) => TScenarioImpl & { woken: () => number };
    /**
     * The same 100 rows rewritten N times inside one frame — a websocket burst. Here the writes
     * COLLIDE, so a store that coalesces per key notifies 100 times and one that does not notifies
     * 100×N. This is the scenario that separates a queue from a plain observer.
     */
    burstCoalescing?: (
        users: TUser[],
        rewrites: number
    ) => TScenarioImpl & { woken: () => number };
    /**
     * A virtualised list scrolling: 100 rows unsubscribe and 100 more subscribe, every frame. Pure
     * subscription churn, no data change — invisible in every other scenario and brutal in practice.
     */
    subscriptionChurn?: (users: TUser[], rows: number) => TScenarioImpl;
    /**
     * The same hot query, but reading only the KEYS of the result instead of the rows.
     *
     * This exists because forcing every library to materialise rows is itself a bias: a store whose
     * idiomatic list view renders keys and lets each row read its own fields (TinyBase, and oimdb's
     * own slot-carrier pattern) never builds that array in practice. Adapters that cannot answer
     * without building the rows report it as unsupported rather than faking a cheaper read.
     */
    queryHotKeysOnly?: (users: TUser[], queries: number) => TScenarioImpl;
    /**
     * A faceted filter — the search-params case: filter by teamId AND active, cycling through all
     * 100 combinations. A library with a multi-key index answers each combination by lookup; one
     * without has to scan or hand-roll an index. Where an adapter had to hand-roll it, its doc
     * comment says so explicitly.
     */
    facetedFilter?: (users: TUser[], queries: number) => TScenarioImpl;
    /**
     * Insert one row into an ORDERED list of N and read the order back. The feed/table case: the
     * cost of keeping sort order without re-sorting the world.
     */
    orderedInsert?: (users: TUser[], inserts: number) => TScenarioImpl;

    /**
     * FAN-OUT. `derived` derived values, each over its own entity, each with a mounted subscriber.
     * One entity changes. Ideal: 1 recompute, 1 wakeup, and a cost that does not grow with the size
     * of the graph.
     */
    fanOutRecompute?: (
        users: TUser[],
        derived: number,
        updates: number
    ) => TReactiveScenario;
    /**
     * DIAMOND — the classic glitch test. `a` and `b` both derive from one source, `c` derives from
     * both, and a subscriber is mounted on `c`. One change to the source must recompute `c` ONCE.
     * A library that propagates breadth-first without levels recomputes it twice and, in between,
     * exposes a `c` built from a stale `a` and a fresh `b`.
     */
    diamondGlitch?: (users: TUser[], updates: number) => TReactiveScenario;
    /**
     * DEEP GRAPH — the diamond that actually breaks things. The final node depends BOTH on the
     * source directly (one hop) and on the far end of a `depth`-long chain fed by that same source.
     * A scheduler that propagates by breadth rather than by topological level fires the final node
     * immediately, as though it sat at level two: it then reads a fresh source beside a stale chain
     * tail, publishes that torn combination, and recomputes again once the chain catches up. Correct
     * behaviour is one recompute, zero inconsistencies.
     */
    deepGraphGlitch?: (
        users: TUser[],
        depth: number,
        updates: number
    ) => TReactiveScenario;
    /**
     * GRANULARITY OF THE DECLARED DEPENDENCY. The derived value reads only `name`; the writes only
     * touch `active`.
     *
     * This is NOT a scoreboard row. Each adapter declares the dependency its own API offers — an
     * entity for oimdb (`on.collection(collection, pk)`), a whole-object atom for Jotai, a single
     * node for Legend-State — and recomputing on any entity change is the correct answer to an
     * entity-level declaration, not a defect. Subscribing to something the computation does not read
     * is the caller's mistake; oimdb has `OIMCollectionChangedFields` for per-field subscriptions
     * when that is what you want (there is no `on.field()` builder to feed a computed from it, so at
     * the computed level the finest declaration is per pk).
     *
     * What the two counters document: whether the wasted recompute happens at all, and whether it
     * escapes downstream. Zero wakeups is the number that matters — a redundant recompute of an
     * unchanged value costs time, a redundant wakeup costs a render.
     */
    unrelatedFieldWakeups?: (
        users: TUser[],
        updates: number
    ) => TReactiveScenario;

    // ---------------------------------------------------------------------------------------
    // TASKS. Each of these is a screen, not an operation: the library is free to solve it in
    // whatever way its own documentation recommends — index, live query, dynamic view, memoised
    // row model, hand-rolled map — and the doc comment on each implementation says which. Setup is
    // untimed; only the interaction is measured. These answer "what does this screen cost", which
    // the per-operation rows above cannot, because "the same operation" stops being well defined
    // once libraries differ in what they cache and what they return.
    // ---------------------------------------------------------------------------------------

    /**
     * TABLE. Pick a team, sort by name, read a page of 20 — then do it another `interactions` times
     * with a different team and page each round.
     */
    taskTable?: (users: TUser[], interactions: number) => TScenarioImpl;
    /**
     * FEED PUSH. 200 rows are on screen, each with its own subscription. A push changes 1,000
     * entities, of which only 12 are visible. Time is the cost of applying it; the counter is how
     * many of the 200 subscriptions woke — 12 is right, 200 is a library that cannot tell.
     */
    taskFeedPush?: (users: TUser[]) => TScenarioImpl & { woken: () => number };
    /**
     * DETAIL CARD. One entity, its comments, a count and a derived caption — then `updates` edits to
     * a single field, each followed by reading the whole card back.
     */
    taskDetailCard?: (
        users: TUser[],
        comments: TComment[],
        updates: number
    ) => TScenarioImpl;
    /**
     * FACET SEARCH. The user changes the filter pair `interactions` times, revisiting combinations,
     * with no writes in between — the shape where caching legitimately pays off.
     */
    taskFacetSearch?: (
        users: TUser[],
        interactions: number
    ) => TScenarioImpl;

    /** Retained heap for N loaded users. */
    memoryForEntities?: (users: TUser[]) => TMemoryImpl;
    /** Retained heap for one subscription per user, on top of the loaded store. */
    memoryForSubscriptions?: (users: TUser[]) => TMemoryImpl;
};
