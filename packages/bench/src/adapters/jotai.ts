import { atom, createStore } from 'jotai/vanilla';
import { atomFamily } from 'jotai-family';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: `atomFamily` is Jotai's documented answer to "an atom per item, keyed by a parameter",
 * and `createStore` is the framework-free store. Subscribing to one item is `store.sub(family(id))`,
 * which is exactly the per-entity granularity the point-update scenario is about.
 * https://github.com/jotaijs/jotai-family  (jotai 2.20 deprecated the built-in `atomFamily`
 * and points here, so this is the current documented recipe)
 * https://jotai.org/docs/core/store
 *
 * Queries have no built-in index: the documented way to derive is a `atom(get => …)` that reads what
 * it needs. Deriving "users of a team" therefore scans, and that is the library's actual shape —
 * building a side index by hand would be measuring our code, not Jotai's.
 */

/**
 * A derived index, built with Jotai's own primitives rather than as a plain JS Map on the side.
 *
 * This matters for fairness: a `Map` assembled in setup from the raw array is not reactive — it is
 * never maintained, never invalidated by a write, and never even reads the store. Comparing that
 * against a live index that every write has to keep correct flatters Jotai for work it did not do.
 * As a derived atom the index sits inside the reactive graph like everyone else's: it is computed
 * from the entity atoms, cached while nothing changes, and thrown away the moment one of them does.
 *
 * The cost of that invalidation is the honest reason Jotai ships no index: rebuilding it is O(n)
 * over the whole collection, which is what the `query cold` row measures.
 */
const buildIndexAtom = <TKey extends string>(
    family: (id: string) => ReturnType<typeof atom<TUser | undefined>>,
    ids: readonly string[],
    keyOf: (user: TUser) => TKey
) =>
    atom(get => {
        const byKey = new Map<TKey, TUser[]>();
        for (const id of ids) {
            const user = get(family(id));
            if (!user) continue;
            const key = keyOf(user);
            const bucket = byKey.get(key);
            if (bucket) bucket.push(user);
            else byKey.set(key, [user]);
        }
        return byKey;
    });

export const jotaiAdapter: TAdapter = {
    name: 'jotai',
    version: '2.20.2',
    docs: 'https://github.com/jotaijs/jotai-family',

    /**
     * TABLE — the index and the sorted list are both derived atoms over the entity atoms, so they
     * live in Jotai's graph and a write invalidates them. Jotai has no query layer; this is what
     * building one out of its own primitives costs.
     */
    taskTable: (users, interactions) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const ids = users.map(u => u.id);
        const indexAtom = buildIndexAtom(family, ids, u => u.teamId);
        const sortedTeam = atomFamily((team: string) =>
            atom(get =>
                [...(get(indexAtom).get(team) ?? [])].sort((x, y) =>
                    x.name < y.name ? -1 : x.name > y.name ? 1 : 0
                )
            )
        );
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = store
                        .get(sortedTeam(`t${i % 50}`))
                        .slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — one write-only atom for the whole push; subscriptions are per row atom. */
    taskFeedPush: users => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) store.sub(family(u.id), () => woken++);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        const applyPush = atom(null, (get, set) => {
            for (const u of pushed) {
                const a = family(u.id);
                set(a, { ...get(a)!, name: `push-${n}` });
            }
            n++;
        });
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.set(applyPush);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — derived atoms for the comment list, the count and the caption. */
    taskDetailCard: (users, comments, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const commentFamily = atomFamily((_id: string) =>
            atom<TComment | undefined>(undefined)
        );
        for (const c of comments) store.set(commentFamily(c.id), c);
        const pk = users[0].id;
        // ⚠ HAND-ROLLED relation index.
        const commentIds = comments.filter(c => c.userId === pk).map(c => c.id);

        const rows = atom(get =>
            commentIds.map(id => get(commentFamily(id))).filter((c): c is TComment => Boolean(c))
        );
        const count = atom(get => get(rows).length);
        const caption = atom(
            get => `${get(family(pk))?.name ?? ''} — ${get(count)} comments`
        );

        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    const a = family(pk);
                    store.set(a, { ...store.get(a)!, name: `n${n++}` });
                    sink = store.get(caption);
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — the composite index is a derived atom, invalidated by writes like any other. */
    taskFacetSearch: (users, interactions) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const ids = users.map(u => u.id);
        const indexAtom = buildIndexAtom(
            family,
            ids,
            u => `${u.teamId}:${u.active}` as const
        );
        const facet = atomFamily((key: string) =>
            atom(get => get(indexAtom).get(key) ?? [])
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = store.get(facet(`t${i % 10}:${Math.floor(i / 10) % 2 === 0}`)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let store: ReturnType<typeof createStore>;
        let family: ReturnType<typeof atomFamily<string, ReturnType<typeof atom<TUser | undefined>>>>;
        return {
            setup: () => {
                store = createStore();
                family = atomFamily((_id: string) =>
                    atom<TUser | undefined>(undefined)
                );
            },
            run: () => {
                for (const u of users) store.set(family(u.id), u);
            },
            verify: () => store.get(family(users[0].id))?.id === users[0].id,
        };
    },

    readByPk: (users, reads) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = store.get(family(pk));
            },
            verify: () => sink?.id === pk,
        };
    },

    pointUpdate: users => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let woken = 0;
        for (const u of users) store.sub(family(u.id), () => woken++);

        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const a = family(target);
                store.set(a, { ...store.get(a)!, name: `renamed-${n++}` });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * COLD: an entity changes between queries, so the derived index atom is invalidated and rebuilt.
     * That rebuild is O(n) over the whole collection — the structural reason Jotai ships no index,
     * and the number this row exists to show.
     */
    queryColdByField: (users, queries) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const ids = users.map(u => u.id);
        const indexAtom = buildIndexAtom(family, ids, u => u.teamId);
        const byTeam = atomFamily((team: string) =>
            atom(get => get(indexAtom).get(team) ?? [])
        );
        const churn = family(users[0].id);
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    store.set(churn, { ...store.get(churn)!, name: `n${n++}` });
                    size = store.get(byTeam(`t${i % 50}`)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * queryHotByField: intentionally absent.
     *
     * "Hot LIVE" means reading a standing index without a memo in front of it. Here the index IS a
     * derived value, so reading it is memoised by construction — there is no live read to measure,
     * and reporting the cached lookup under a live label compares this library's cache hit against
     * another's real work. The memoised number lives in `query cached`; the cost of keeping the
     * index correct lives in `query cold`.
     */


    // CACHED: a derived atom memoises against its dependencies, so an unchanged read is a hit.
    queryCachedByField: (users, queries) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const ids = users.map(u => u.id);
        const byTeam = atomFamily((team: string) =>
            atom(get =>
                ids
                    .map(id => get(family(id)))
                    .filter((u): u is TUser => u !== undefined && u.teamId === team)
            )
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = store.get(byTeam(`t${i % 50}`)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const store = createStore();
        const commentFamily = atomFamily((_id: string) =>
            atom<TComment | undefined>(undefined)
        );
        for (const c of comments) store.set(commentFamily(c.id), c);
        const commentIds = comments.map(c => c.id);
        const byUser = atomFamily((userId: string) =>
            atom(get =>
                commentIds
                    .map(id => get(commentFamily(id)))
                    .filter((c): c is TComment => c !== undefined && c.userId === userId)
            )
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = store.get(byUser(`u${i % users.length}`)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * Derived atoms are Jotai's computed: `atom(get => …)` memoises against its dependencies and
     * recomputes only when one of them changed. Chaining them is the documented composition model.
     * https://jotai.org/docs/core/atom#derived-atoms
     */
    computedChain: (users, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const pk = users[users.length >> 1].id;

        const source = family(pk);
        const level1 = atom(get => get(source)?.name ?? '');
        const level2 = atom(get => get(level1).toUpperCase());
        const level3 = atom(get => `${get(level2)}!`);

        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.set(source, {
                        ...store.get(source)!,
                        name: `n${n++}`,
                    });
                    sink = store.get(level3);
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    /**
     * Jotai core has no separate effect primitive — a store subscription IS the effect, and that is
     * what the store docs present for running work on change (`jotai-effect` is a separate opt-in
     * package, not part of the core measured here).
     * https://jotai.org/docs/core/store#sub
     */
    effectDispatch: users => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let ran = 0;
        for (const u of users) store.sub(family(u.id), () => ran++);

        const target = family(users[users.length >> 1].id);
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                store.set(target, { ...store.get(target)!, name: `n${n++}` });
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    /**
     * A write-only atom is Jotai's documented way to make several writes one transaction: the
     * notifications for everything set inside it are flushed together.
     * https://jotai.org/docs/core/atom#write-only-atoms
     */
    batchUpdate: users => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let woken = 0;
        for (const u of users) store.sub(family(u.id), () => woken++);

        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        const writeBatch = atom(null, (get, set, name: string) => {
            for (const u of slice) {
                const a = family(u.id);
                set(a, { ...get(a)!, name });
            }
        });
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.set(writeBatch, `n${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    subscriptionChurn: (users, rows) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let stops: (() => void)[] = [];
        let offset = 0;
        return {
            setup: () => {
                for (const stop of stops) stop();
                stops = users
                    .slice(0, rows)
                    .map(u => store.sub(family(u.id), () => undefined));
                offset = 0;
            },
            run: () => {
                for (const stop of stops) stop();
                offset = (offset + rows) % (users.length - rows);
                stops = users
                    .slice(offset, offset + rows)
                    .map(u => store.sub(family(u.id), () => undefined));
            },
            verify: () => stops.length === rows,
        };
    },

    /**
     * ⚠ HAND-ROLLED — Jotai has no indexing tooling, in core or in the ecosystem. `jotai-family`
     * keys atoms by a parameter but does not index their CONTENT, and there is no jotai-* package
     * that does. The honest fast implementation is therefore ours, not the library's: a Map from
     * composite key to a member atom, built once and read through `atomFamily`. Its speed is a
     * property of this file, not of Jotai — what Jotai actually offers here is the derived-atom
     * scan, which is roughly the `query cold` row.
     */
    /**
     * ⚠ HAND-ROLLED index — Jotai has no indexing tooling in core or in the ecosystem, so the
     * composite map below is ours. The derived atom in front of it is Jotai's own memoisation, and
     * it is used because that is how the library is meant to serve a repeated query.
     */
    /**
     * The composite index is a DERIVED ATOM over the entity atoms — Jotai's own machinery — so it is
     * maintained by the graph and invalidated by writes, exactly like the indexes it is measured
     * against. Jotai still ships no indexing tooling; what is idiomatic here is the derived atom.
     */
    facetedFilter: (users, queries) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const ids = users.map(u => u.id);
        const indexAtom = buildIndexAtom(
            family,
            ids,
            u => `${u.teamId}:${u.active}` as const
        );
        const facet = atomFamily((key: string) =>
            atom(get => get(indexAtom).get(key) ?? [])
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = store.get(facet(`t${i % 50}:${Math.floor(i / 50) % 2 === 0}`)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },













    /**
     * Jotai has no index and no ordered structure, so the idiomatic ordered list is a derived atom
     * that sorts. It re-sorts whenever a member changed — that is the library's actual shape, not a
     * handicap we imposed.
     */
    /**
     * Jotai has no index and no ordered structure, so the idiomatic ordered list is a derived atom
     * that sorts. Rebuilt in `setup` so repeats do not sort an ever-growing list.
     */
    orderedInsert: (users, inserts) => {
        let store: ReturnType<typeof createStore>;
        let family: ReturnType<
            typeof atomFamily<string, ReturnType<typeof atom<TUser | undefined>>>
        >;
        let ids: ReturnType<typeof atom<string[]>>;
        let ordered: ReturnType<typeof atom<TUser[]>>;
        let size = 0;
        return {
            setup: () => {
                store = createStore();
                family = atomFamily((_id: string) =>
                    atom<TUser | undefined>(undefined)
                );
                for (const u of users) store.set(family(u.id), u);
                ids = atom<string[]>(
                    users.filter(u => u.teamId === 't0').map(u => u.id)
                );
                ordered = atom(get =>
                    get(ids)
                        .map(id => get(family(id)))
                        .filter((u): u is TUser => Boolean(u))
                        .sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        )
                );
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    const id = `new-${i}`;
                    store.set(family(id), {
                        id,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    store.set(ids, [...store.get(ids), id]);
                    size = store.get(ordered).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * The same burst through a write-only atom. Jotai holds notifications until the write function
     * returns, so repeated writes to the same atom collapse into one notification per subscriber —
     * measured, not assumed: 100 notifications for 1,000 writes, the same floor oimdb reaches.
     * https://jotai.org/docs/core/atom#write-only-atoms
     */
    burstCoalescing: (users, rewrites) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) store.sub(family(u.id), () => woken++);

        let n = 0;
        const writeBurst = atom(null, (get, set) => {
            for (let r = 0; r < rewrites; r++) {
                for (const u of hot) {
                    const a = family(u.id);
                    set(a, { ...get(a)!, name: `n${n}` });
                }
                n++;
            }
        });
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.set(writeBurst);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** Derived atoms, one per entity, each kept live by a store subscription. */
    fanOutRecompute: (users, derived, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);

        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const source = family(users[i].id);
            const name = atom(get => {
                recomputes++;
                return get(source)?.name ?? '';
            });
            store.sub(name, () => {
                wakeups++;
                store.get(name);
            });
            store.get(name);
        }

        const target = family(users[0].id);
        let n = 0;
        return {
            setup: () => {
                store.set(target, { ...store.get(target)!, name: `settle${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.set(target, { ...store.get(target)!, name: `n${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    /** Jotai resolves a diamond through its dependency graph, so `c` should compute once. */
    diamondGlitch: (users, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const source = family(users[0].id);

        const a = atom(get => (get(source)?.name ?? '').length);
        const b = atom(get => (get(source)?.name ?? '').toUpperCase());
        let recomputes = 0;
        const c = atom(get => {
            recomputes++;
            return `${get(a)}:${get(b)}`;
        });
        let wakeups = 0;
        store.sub(c, () => {
            wakeups++;
            store.get(c);
        });
        store.get(c);

        let n = 0;
        return {
            setup: () => {
                store.set(source, { ...store.get(source)!, name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.set(source, {
                        ...store.get(source)!,
                        name: `name-${n++}`,
                    });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    /** Deep diamond — see the oimdb adapter for what this shape is testing. */
    deepGraphGlitch: (users, depth, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const source = family(users[0].id);

        const chain: ReturnType<typeof atom<string>>[] = [];
        chain.push(atom(get => get(source)?.name ?? ''));
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            chain.push(atom(get => get(previous)));
        }
        const tail = chain[depth - 1];

        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = atom(get => {
            recomputes++;
            const direct = get(source)?.name ?? '';
            for (const face of faces) {
                if (get(face) !== direct) inconsistencies++;
            }
            const deep = get(tail);
            if (direct !== deep) inconsistencies++;
            return `${direct}|${deep}`;
        });
        let wakeups = 0;
        store.sub(final, () => {
            wakeups++;
            store.get(final);
        });
        store.get(final);

        let n = 0;
        return {
            setup: () => {
                store.set(source, { ...store.get(source)!, name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.set(source, {
                        ...store.get(source)!,
                        name: `name-${n++}`,
                    });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /**
     * The atom holds the whole user, so writing `active` replaces the object the derived atom reads
     * — it recomputes. The derived VALUE is an unchanged string, and Jotai compares with `Object.is`
     * before notifying, so nothing downstream should wake.
     */
    unrelatedFieldWakeups: (users, updates) => {
        const store = createStore();
        const family = atomFamily((_id: string) =>
            atom<TUser | undefined>(undefined)
        );
        for (const u of users) store.set(family(u.id), u);
        const source = family(users[0].id);

        let recomputes = 0;
        const name = atom(get => {
            recomputes++;
            return get(source)?.name ?? '';
        });
        let wakeups = 0;
        store.sub(name, () => {
            wakeups++;
            store.get(name);
        });
        store.get(name);

        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                store.set(source, { ...store.get(source)!, active: flag });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    store.set(source, { ...store.get(source)!, active: flag });
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => {
            const store = createStore();
            const family = atomFamily((_id: string) =>
                atom<TUser | undefined>(undefined)
            );
            for (const u of users) store.set(family(u.id), u);
            return { store, family };
        },
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const store = createStore();
            const family = atomFamily((_id: string) =>
                atom<TUser | undefined>(undefined)
            );
            for (const u of users) store.set(family(u.id), u);
            const stops = users.map(u =>
                store.sub(family(u.id), () => undefined)
            );
            return { store, family, stops };
        },
    }),
};
