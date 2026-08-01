import {
    OIMEventQueue,
    OIMIndexStoreTrieDrivenSetBased,
    createOIMCollectionKit,
} from '../../../core/dist/index.js';
import type { TOIMKeyPath } from '../../../core/dist/index.js';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: the package README's "Basic Usage" — a collection kit, a derived index for lookups by a
 * field, keyed subscriptions for reactivity, and an explicit `queue.flush()` to deliver.
 * https://github.com/abaikov/oimdb/tree/master/packages/core#-basic-usage
 */
export const oimdbAdapter: TAdapter = {
    name: 'oimdb',
    version: '3.12.1',
    docs: 'packages/core/README.md#-basic-usage',

    /**
     * TABLE — solved with a derived ordered index per sort field: the index keeps each team's bucket
     * in name order on write, so a page is a slice of an already-sorted array.
     */
    taskTable: (users, interactions) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeamOrdered = kit.indexFactory.derivedArrayIndex<string>(
            u => u.teamId,
            { orderBy: (u: TUser) => u.name }
        );
        kit.collection.upsertMany(users);
        queue.flush();
        // The sorted list per team goes behind an OIMComputed, the same way the other adapters put
        // theirs behind a derived atom / live query / maintained view. Reading the index directly on
        // every interaction would materialise 200 entities each time and compare our real work
        // against their cache hit.
        const teamRows = new Map<string, ReturnType<typeof kit.computed<(TUser | undefined)[]>>>();
        const rowsFor = (team: string) => {
            let computed = teamRows.get(team);
            if (!computed) {
                computed = kit.computed([kit.on.index(byTeamOrdered, team)], () =>
                    byTeamOrdered.getEntitiesByKey<TUser>(team)
                );
                teamRows.set(team, computed);
            }
            return computed;
        };
        let page: (TUser | undefined)[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const rows = rowsFor(`t${i % 50}`).get();
                    const offset = (i % 5) * 20;
                    page = rows.slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /**
     * FEED PUSH — solved with per-pk subscriptions and one batched write: the queue delivers to the
     * keys that actually changed, so the 188 rows on screen that were not in the push stay asleep.
     */
    taskFeedPush: users => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) {
            kit.collection.subscribeOnKey(u.id, () => woken++);
        }
        // The push: 1,000 entities, of which the first 12 happen to be on screen.
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const batch = pushed.map(u => ({ ...u, name: `push-${n}` }));
                n++;
                kit.collection.upsertMany(batch);
                queue.flush();
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * DETAIL CARD — the entity, its comments through a derived index, a count and a caption, all as
     * computeds so a field edit repaints only what depends on it.
     */
    taskDetailCard: (users, comments, updates) => {
        const queue = new OIMEventQueue();
        const userKit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const commentKit = createOIMCollectionKit<TComment, string>(queue, {
            selectPk: c => c.id,
        });
        const byUser = commentKit.indexFactory.derivedSetIndex<string>(
            c => c.userId
        );
        userKit.collection.upsertMany(users);
        commentKit.collection.upsertMany(comments);
        queue.flush();

        const pk = users[0].id;
        const user = userKit.computed(
            [userKit.on.collection(userKit.collection, pk)],
            () => userKit.collection.getOneByPk(pk)
        );
        const rows = userKit.computed([userKit.on.index(byUser, pk)], () =>
            byUser.getEntitiesByKey<TComment>(pk)
        );
        const count = userKit.computed([userKit.on.computed(rows)], () =>
            rows.get().length
        );
        const caption = userKit.computed(
            [userKit.on.computed(user), userKit.on.computed(count)],
            () => `${user.get()?.name ?? ''} — ${count.get()} comments`
        );

        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    userKit.collection.upsertOneByPk(pk, { name: `n${n++}` });
                    queue.flush();
                    sink = caption.get();
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /**
     * FACET SEARCH — a trie-backed composite index behind an `OIMComputed` per combination, so a
     * revisited filter pair is a cache hit and a new one is an O(arity) lookup.
     */
    taskFacetSearch: (users, interactions) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byFacet = kit.indexFactory.derivedSetIndex<TOIMKeyPath>(
            u => [[u.teamId, u.active]],
            { indexOptions: { store: new OIMIndexStoreTrieDrivenSetBased() } }
        );
        kit.collection.upsertMany(users);
        queue.flush();

        const cache = new Map<string, ReturnType<typeof kit.computed<(TUser | undefined)[]>>>();
        const facet = (team: string, active: boolean) => {
            const key = `${team}:${active}`;
            let computed = cache.get(key);
            if (!computed) {
                computed = kit.computed(
                    [kit.on.index(byFacet, [team, active])],
                    () => byFacet.getEntitiesByKey<TUser>([team, active])
                );
                cache.set(key, computed);
            }
            return computed;
        };

        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    // Ten distinct combinations, revisited — a user narrowing a search.
                    size = facet(`t${i % 10}`, Math.floor(i / 10) % 2 === 0).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let queue: OIMEventQueue;
        let kit: ReturnType<typeof createOIMCollectionKit<TUser, string>>;
        return {
            setup: () => {
                queue = new OIMEventQueue();
                kit = createOIMCollectionKit<TUser, string>(queue, {
                    selectPk: u => u.id,
                });
            },
            run: () => {
                kit.collection.upsertMany(users);
                queue.flush();
            },
            verify: () => kit.collection.getAll().length === users.length,
        };
    },

    readByPk: (users, reads) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) {
                    sink = kit.collection.getOneByPk(pk);
                }
            },
            verify: () => sink?.id === pk,
        };
    },

    pointUpdate: users => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let woken = 0;
        // One subscriber per entity — the shape a per-row component takes.
        for (const u of users) {
            kit.collection.subscribeOnKey(u.id, () => woken++);
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                kit.collection.upsertOneByPk(target, { name: `renamed-${n++}` });
                queue.flush();
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    // COLD: an entity changes between queries, so the bucket must genuinely be re-read.
    queryColdByField: (users, queries) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = kit.indexFactory.derivedSetIndex<string>(u => u.teamId);
        kit.collection.upsertMany(users);
        queue.flush();
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    kit.collection.upsertOneByPk(churn, { name: `n${n++}` });
                    queue.flush();
                    size = byTeam.getEntitiesByKey<TUser>(`t${i % 50}`).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // HOT, LIVE: the index is read on every query. This is what the query itself costs.
    queryHotByField: (users, queries) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = kit.indexFactory.derivedSetIndex<string>(u => u.teamId);
        kit.collection.upsertMany(users);
        queue.flush();
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = byTeam.getEntitiesByKey<TUser>(`t${i % 50}`).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * CACHED: `OIMComputed` is oimdb's memoising primitive — it holds the computed value and
     * recomputes only once a dependency marks it dirty. Nothing changes here, so every read after
     * the first is a cache hit.
     */
    queryCachedByField: (users, queries) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = kit.indexFactory.derivedSetIndex<string>(u => u.teamId);
        kit.collection.upsertMany(users);
        queue.flush();

        const computeds = Array.from({ length: 50 }, (_, t) =>
            kit.computed(
                [kit.on.index(byTeam, `t${t}`)],
                () => byTeam.getEntitiesByKey<TUser>(`t${t}`)
            )
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = computeds[i % 50].get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const queue = new OIMEventQueue();
        const usersKit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const commentsKit = createOIMCollectionKit<TComment, string>(queue, {
            selectPk: c => c.id,
        });
        const byUser = commentsKit.indexFactory.derivedSetIndex<string>(
            c => c.userId
        );
        usersKit.collection.upsertMany(users);
        commentsKit.collection.upsertMany(comments);
        queue.flush();
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = byUser.getEntitiesByKey<TComment>(
                        `u${i % users.length}`
                    ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    computedChain: (users, updates) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();
        const pk = users[users.length >> 1].id;

        const level1 = kit.computed(
            [kit.on.collection(kit.collection, pk)],
            () => kit.collection.getOneByPk(pk)?.name ?? ''
        );
        const level2 = kit.computed(
            [kit.on.computed(level1)],
            () => level1.get().toUpperCase()
        );
        const level3 = kit.computed(
            [kit.on.computed(level2)],
            () => `${level2.get()}!`
        );

        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    kit.collection.upsertOneByPk(pk, { name: `n${n++}` });
                    queue.flush();
                    sink = level3.get();
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    effectDispatch: users => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let ran = 0;
        for (const u of users) {
            kit.effect([kit.on.collection(kit.collection, u.id)], () => ran++);
        }
        queue.flush();

        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                kit.collection.upsertOneByPk(target, { name: `n${n++}` });
                queue.flush();
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let woken = 0;
        for (const u of users) {
            kit.collection.subscribeOnKey(u.id, () => woken++);
        }
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const batch = slice.map(u => ({ ...u, name: `n${n}` }));
                n++;
                kit.collection.upsertMany(batch);
                queue.flush();
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    subscriptionChurn: (users, rows) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let stops: (() => void)[] = [];
        let offset = 0;
        return {
            setup: () => {
                for (const stop of stops) stop();
                stops = users
                    .slice(0, rows)
                    .map(u => kit.collection.subscribeOnKey(u.id, () => undefined));
                offset = 0;
            },
            run: () => {
                // One scroll frame: drop the rows that left, subscribe the ones that entered.
                for (const stop of stops) stop();
                offset = (offset + rows) % (users.length - rows);
                stops = users
                    .slice(offset, offset + rows)
                    .map(u => kit.collection.subscribeOnKey(u.id, () => undefined));
            },
            verify: () => stops.length === rows,
        };
    },

    /**
     * The store is rebuilt in `setup` (untimed): the run inserts, so leaving the structure to grow
     * across repeats would make every later repeat sort a bigger bucket and the median meaningless.
     */
    /**
     * Keys only, solved the way oimdb is meant to be used for a repeated read: the pk list per key
     * goes behind an `OIMComputed`, so an unchanged key is answered from the memo instead of walking
     * the bucket and dereferencing every slot.
     */
    queryHotKeysOnly: (users, queries) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = kit.indexFactory.derivedArrayIndex<string>(u => u.teamId);
        kit.collection.upsertMany(users);
        queue.flush();
        const cache = new Map<string, ReturnType<typeof kit.computed<string[]>>>();
        const pksFor = (team: string) => {
            let computed = cache.get(team);
            if (!computed) {
                computed = kit.computed([kit.on.index(byTeam, team)], () =>
                    byTeam.getPksByKey(team)
                );
                cache.set(team, computed);
            }
            return computed;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = pksFor(`t${i % 50}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * Built-in tooling: a derived index whose key is a `TOIMKeyPath`, backed by the trie store. The
     * key is a tuple matched by content in O(arity) — no string concatenation, no separator
     * collisions — and it is maintained on write like any other derived index.
     */
    facetedFilter: (users, queries) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byFacet = kit.indexFactory.derivedSetIndex<TOIMKeyPath>(
            u => [[u.teamId, u.active]],
            { indexOptions: { store: new OIMIndexStoreTrieDrivenSetBased() } }
        );
        kit.collection.upsertMany(users);
        queue.flush();
        // The trie index answers a new combination in O(arity); an `OIMComputed` per combination
        // answers a repeated one from the memo. Both halves are what the library offers, so both
        // are used — the competitors' derived atoms and dynamic views do exactly this.
        const cache = new Map<string, ReturnType<typeof kit.computed<(TUser | undefined)[]>>>();
        const facet = (team: string, active: boolean) => {
            const key = `${team}:${active}`;
            let computed = cache.get(key);
            if (!computed) {
                computed = kit.computed([kit.on.index(byFacet, [team, active])], () =>
                    byFacet.getEntitiesByKey<TUser>([team, active])
                );
                cache.set(key, computed);
            }
            return computed;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = facet(`t${i % 50}`, Math.floor(i / 50) % 2 === 0).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },






    orderedInsert: (users, inserts) => {
        let kit: ReturnType<typeof createOIMCollectionKit<TUser, string>>;
        let queue: OIMEventQueue;
        let ordered: ReturnType<
            ReturnType<
                typeof createOIMCollectionKit<TUser, string>
            >['indexFactory']['derivedArrayIndex']
        >;
        let size = 0;
        return {
            setup: () => {
                queue = new OIMEventQueue();
                kit = createOIMCollectionKit<TUser, string>(queue, {
                    selectPk: u => u.id,
                });
                // A derived index with `orderBy` keeps each bucket ordered on write.
                ordered = kit.indexFactory.derivedArrayIndex<string>(
                    u => u.teamId,
                    { orderBy: (u: TUser) => u.name }
                );
                kit.collection.upsertMany(users);
                queue.flush();
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    kit.collection.upsertOne({
                        id: `new-${i}`,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    queue.flush();
                    // Entities, not pks — the other adapters hand back rows here.
                    size = ordered.getEntitiesByKey<TUser>('t0').length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * A websocket burst: the SAME rows are written several times before the frame ends. The queue is
     * flushed once, so a store that coalesces per key notifies each subscriber once, not once per
     * write. This is what `batchUpdate` does not measure — there every write hit a distinct entity.
     */
    burstCoalescing: (users, rewrites) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) {
            kit.collection.subscribeOnKey(u.id, () => woken++);
        }
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (let r = 0; r < rewrites; r++) {
                    for (const u of hot) {
                        kit.collection.upsertOneByPk(u.id, { name: `n${n}` });
                    }
                    n++;
                }
                queue.flush();
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * FAN-OUT: 1,000 computeds, each over its own entity, each kept live by a mounted effect. One
     * entity changes per write.
     */
    fanOutRecompute: (users, derived, updates) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();

        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const pk = users[i].id;
            const value = kit.computed([kit.on.collection(kit.collection, pk)], () => {
                recomputes++;
                return kit.collection.getOneByPk(pk)?.name ?? '';
            });
            kit.effect([kit.on.computed(value)], () => {
                wakeups++;
                value.get();
            });
        }
        queue.flush();

        const target = users[0].id;
        let n = 0;
        return {
            setup: () => {
                // One settling write, untimed: a computed emits once on the first write after it is
                // first read, even when the value is unchanged. Counting that one-off as steady
                // state would misreport every library's propagation.
                kit.collection.upsertOneByPk(target, { name: `settle${n++}` });
                queue.flush();
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    kit.collection.upsertOneByPk(target, { name: `n${n++}` });
                    queue.flush();
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    /**
     * DIAMOND: `a` and `b` both read the source, `c` reads both. The runtime schedules by
     * topological level, so `c` should run once per source change, never on a half-updated pair.
     */
    diamondGlitch: (users, updates) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();
        const pk = users[0].id;

        const a = kit.computed([kit.on.collection(kit.collection, pk)], () =>
            (kit.collection.getOneByPk(pk)?.name ?? '').length
        );
        const b = kit.computed([kit.on.collection(kit.collection, pk)], () =>
            (kit.collection.getOneByPk(pk)?.name ?? '').toUpperCase()
        );
        let recomputes = 0;
        const c = kit.computed([kit.on.computed(a), kit.on.computed(b)], () => {
            recomputes++;
            return `${a.get()}:${b.get()}`;
        });
        let wakeups = 0;
        kit.effect([kit.on.computed(c)], () => {
            wakeups++;
            c.get();
        });
        queue.flush();

        let n = 0;
        return {
            setup: () => {
                kit.collection.upsertOneByPk(pk, { name: `settle-${n++}` });
                queue.flush();
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    kit.collection.upsertOneByPk(pk, { name: `name-${n++}` });
                    queue.flush();
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    /**
     * DEEP DIAMOND. `chain[0..depth-1]` all trace back to one entity; the final node depends on that
     * SAME entity directly and on `chain[depth-1]`. Both inputs carry the same value, so any moment
     * where they disagree is a torn read the library made visible.
     *
     * oimdb schedules by topological level — the runtime derives the final node's depth from its
     * dependencies — so it should run once, after the whole chain, and never see a mismatch.
     */
    deepGraphGlitch: (users, depth, updates) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();
        const pk = users[0].id;
        const readName = () => kit.collection.getOneByPk(pk)?.name ?? '';

        const chain: ReturnType<typeof kit.computed<string>>[] = [];
        chain.push(
            kit.computed([kit.on.collection(kit.collection, pk)], readName)
        );
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            chain.push(
                kit.computed([kit.on.computed(previous)], () => previous.get())
            );
        }
        const tail = chain[depth - 1];

        // Many faces, not two: the final node hangs off the source AND off every other level of
        // the chain, so its dependencies sit at levels 1, 2, 4, 6, 8… If the scheduler honours the
        // deepest one it runs once; if it reacts to the shallowest it runs early and repeatedly.
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = kit.computed(
            [
                kit.on.collection(kit.collection, pk),
                ...faces.map(face => kit.on.computed(face)),
                kit.on.computed(tail),
            ],
            () => {
                recomputes++;
                const direct = readName();
                // Every face carries the same value; any disagreement is a torn read.
                for (const face of faces) {
                    if (face.get() !== direct) inconsistencies++;
                }
                const deep = tail.get();
                if (direct !== deep) inconsistencies++;
                return `${direct}|${deep}`;
            }
        );
        let wakeups = 0;
        kit.effect([kit.on.computed(final)], () => {
            wakeups++;
            final.get();
        });
        queue.flush();

        let n = 0;
        return {
            setup: () => {
                kit.collection.upsertOneByPk(pk, { name: `settle-${n++}` });
                queue.flush();
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    kit.collection.upsertOneByPk(pk, { name: `name-${n++}` });
                    queue.flush();
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /**
     * DEPENDENCY GRANULARITY: the computed reads `name`, the writes touch `active`. The dependency
     * declared here is `on.collection(collection, pk)` — the ENTITY — so recomputing on any change
     * to that entity is the library doing what it was told. The value is unchanged, the default
     * `Object.is` comparison stops the propagation, and nothing downstream wakes. Per-field
     * subscriptions exist separately via `OIMCollectionChangedFields`.
     */
    unrelatedFieldWakeups: (users, updates) => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        kit.collection.upsertMany(users);
        queue.flush();
        const pk = users[0].id;

        let recomputes = 0;
        const name = kit.computed([kit.on.collection(kit.collection, pk)], () => {
            recomputes++;
            return kit.collection.getOneByPk(pk)?.name ?? '';
        });
        let wakeups = 0;
        kit.effect([kit.on.computed(name)], () => {
            wakeups++;
            name.get();
        });
        queue.flush();

        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                kit.collection.upsertOneByPk(pk, { active: flag });
                queue.flush();
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    kit.collection.upsertOneByPk(pk, { active: flag });
                    queue.flush();
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => {
            const queue = new OIMEventQueue();
            const kit = createOIMCollectionKit<TUser, string>(queue, {
                selectPk: u => u.id,
            });
            kit.collection.upsertMany(users);
            queue.flush();
            return { queue, kit };
        },
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const queue = new OIMEventQueue();
            const kit = createOIMCollectionKit<TUser, string>(queue, {
                selectPk: u => u.id,
            });
            kit.collection.upsertMany(users);
            queue.flush();
            const stops = users.map(u =>
                kit.collection.subscribeOnKey(u.id, () => undefined)
            );
            return { queue, kit, stops };
        },
    }),
};
