import { combine, createEvent, createStore } from 'effector';
import type { Store } from 'effector';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: Effector's own docs. State lives in a `Store`, changes arrive as events the store is
 * `.on`-ed to, derived state is `.map` / `combine`, and `.watch` is the subscription.
 * https://effector.dev/docs/api/effector/store
 * https://effector.dev/docs/api/effector/combine
 *
 * Two properties of the model shape every number below, and neither is a handicap imposed here:
 *
 * 1. **Stores are immutable.** A write produces a new state object, so holding N entities in one
 *    store means every write copies a record of N keys. Holding them in N stores avoids the copy
 *    but makes "all users of team X" a fan-in over N stores. This file uses one store per entity —
 *    the shape that keeps writes O(1) and matches how the other per-entity adapters are built.
 * 2. **`.watch` fires immediately on subscribe.** Counters are therefore zeroed after every
 *    subscription is in place, never before.
 *
 * Effector is a state manager, not a database: no index, no query. Where a lookup needs one, the
 * comment says the index is ours.
 */
type TUserStores = Map<string, Store<TUser>>;

/**
 * A store per entity, each with its OWN event.
 *
 * The obvious shortcut — one shared `setUser` event that every store filters in its `.on` — makes a
 * single write run 10,000 reducers, because an Effector event is delivered to every unit watching
 * it. That is a fan-out of the benchmark's making, not a property of the library: an app with
 * per-entity stores gives each one its own event (or targets it with `sample`). Measured at 14 ms
 * per write before this change and a fraction of that after.
 */
const buildUsers = (users: TUser[]) => {
    const stores: TUserStores = new Map();
    const events = new Map<string, ReturnType<typeof createEvent<TUser>>>();
    for (const u of users) {
        const setOne = createEvent<TUser>();
        events.set(u.id, setOne);
        stores.set(u.id, createStore(u).on(setOne, (_state, next) => next));
    }
    const setUser = (next: TUser) => events.get(next.id)?.(next);
    return { stores, setUser, events };
};

/**
 * A REACTIVE index: `combine` over every entity store, regrouping whenever any of them changes.
 *
 * A plain Map built once from the source array is a snapshot, not an index — move an entity between
 * teams and it answers the old membership forever, which makes it incomparable with a store that
 * maintains its index on write. Keeping it correct in Effector means recombining all N stores, and
 * that O(n) rebuild is the honest price of not having an index primitive.
 */
const reactiveIndex = <TKey extends string>(
    stores: TUserStores,
    keyOf: (u: TUser) => TKey
): Store<Map<TKey, TUser[]>> =>
    combine([...stores.values()], list => {
        const byKey = new Map<TKey, TUser[]>();
        for (const u of list) {
            const key = keyOf(u);
            const bucket = byKey.get(key);
            if (bucket) bucket.push(u);
            else byKey.set(key, [u]);
        }
        return byKey;
    });

export const effectorAdapter: TAdapter = {
    name: 'effector',
    version: '23.4.4',
    docs: 'https://effector.dev/docs/api/effector/combine',

    /** TABLE — ⚠ HAND-ROLLED index; the sorted page per team is a `combine`, Effector's memo. */
    taskTable: (users, interactions) => {
        const { stores } = buildUsers(users);
        const byTeam = reactiveIndex(stores, u => u.teamId);
        const sorted = new Map<string, Store<TUser[]>>();
        const rowsFor = (team: string) => {
            let memo = sorted.get(team);
            if (!memo) {
                memo = byTeam.map(index =>
                    [...(index.get(team) ?? [])].sort((a, b) =>
                        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                    )
                );
                sorted.set(team, memo);
            }
            return memo;
        };
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = rowsFor(`t${i % 50}`)
                        .getState()
                        .slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /**
     * FEED PUSH — one `.watch` per visible row. A single event carries the whole push, so Effector
     * settles the graph once rather than per entity.
     */
    taskFeedPush: users => {
        const { stores } = buildUsers(users);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        const applyPush = createEvent<string>();
        for (const u of pushed) {
            stores.set(
                u.id,
                stores
                    .get(u.id)!
                    .on(applyPush, (state, name) => ({ ...state, name }))
            );
        }
        let woken = 0;
        for (const u of users.slice(0, 200)) {
            stores.get(u.id)!.watch(() => woken++);
        }
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                applyPush(`push-${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — `combine` for the comment list, its count and the caption. */
    taskDetailCard: (users, comments, updates) => {
        const { stores, setUser } = buildUsers(users);
        const pk = users[0].id;
        // ⚠ HAND-ROLLED relation index.
        const mine = comments.filter(c => c.userId === pk);
        const commentStores = mine.map(c => createStore<TComment>(c));
        const rows = commentStores.length
            ? combine(commentStores, list => list)
            : createStore<TComment[]>([]);
        const count = rows.map(list => list.length);
        const caption = combine(
            stores.get(pk)!,
            count,
            (user, total) => `${user.name} — ${total} comments`
        );
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    setUser({ ...stores.get(pk)!.getState(), name: `n${n++}` });
                    sink = caption.getState();
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — ⚠ HAND-ROLLED composite index, each combination a `combine`. */
    taskFacetSearch: (users, interactions) => {
        const { stores } = buildUsers(users);
        const byFacet = reactiveIndex(stores, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, Store<TUser[]>>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = byFacet.map(index => index.get(key) ?? []);
                memos.set(key, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = facet(
                        `t${i % 10}:${Math.floor(i / 10) % 2 === 0}`
                    ).getState().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let stores: TUserStores;
        return {
            setup: () => {
                stores = new Map();
            },
            run: () => {
                for (const u of users) stores.set(u.id, createStore(u));
            },
            verify: () => stores.size === users.length,
        };
    },

    readByPk: (users, reads) => {
        const { stores } = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = stores.get(pk)!.getState();
            },
            verify: () => sink?.id === pk,
        };
    },

    /** ⚠ HAND-ROLLED index. The write between queries invalidates the combine behind it. */
    queryColdByField: (users, queries) => {
        const { stores, setUser } = buildUsers(users);
        const byTeam = reactiveIndex(stores, u => u.teamId);
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    setUser({
                        ...stores.get(churn)!.getState(),
                        name: `n${n++}`,
                    });
                    size = (byTeam.getState().get(`t${i % 50}`) ?? []).length;
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


    /** CACHED: `combine` holds its result and only recomputes when a member store changes. */
    queryCachedByField: (users, queries) => {
        const { stores } = buildUsers(users);
        const byTeam = reactiveIndex(stores, u => u.teamId);
        const memos = new Map<string, Store<TUser[]>>();
        const rowsFor = (team: string) => {
            let memo = memos.get(team);
            if (!memo) {
                memo = byTeam.map(index => index.get(team) ?? []);
                memos.set(team, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`t${i % 50}`).getState().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED composite index behind a `combine` per combination. */
    facetedFilter: (users, queries) => {
        const { stores } = buildUsers(users);
        const byFacet = reactiveIndex(stores, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, Store<TUser[]>>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = byFacet.map(index => index.get(key) ?? []);
                memos.set(key, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = facet(
                        `t${i % 50}:${Math.floor(i / 50) % 2 === 0}`
                    ).getState().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED relation index behind a `combine` per user. */
    relatedLookup: (users, comments, queries) => {
        const commentStores = new Map<string, Store<TComment>>();
        for (const c of comments) commentStores.set(c.id, createStore(c));
        const idsByUser = new Map<string, string[]>();
        for (const c of comments) {
            const bucket = idsByUser.get(c.userId);
            if (bucket) bucket.push(c.id);
            else idsByUser.set(c.userId, [c.id]);
        }
        const memos = new Map<string, Store<TComment[]>>();
        const rowsFor = (userId: string) => {
            let memo = memos.get(userId);
            if (!memo) {
                const members = (idsByUser.get(userId) ?? []).map(
                    id => commentStores.get(id)!
                );
                memo = members.length
                    ? combine(members, list => list)
                    : createStore<TComment[]>([]);
                memos.set(userId, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`u${i % users.length}`).getState().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    computedChain: (users, updates) => {
        const { stores, setUser } = buildUsers(users);
        const pk = users[users.length >> 1].id;
        const source = stores.get(pk)!;
        const level1 = source.map(u => u.name);
        const level2 = level1.map(name => name.toUpperCase());
        const level3 = level2.map(name => `${name}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    setUser({ ...source.getState(), name: `n${n++}` });
                    sink = level3.getState();
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    /** ⚠ HAND-ROLLED ordered list — Effector has no sorted structure. */
    orderedInsert: (users, inserts) => {
        let stores: TUserStores;
        let ids: string[];
        let size = 0;
        return {
            setup: () => {
                stores = buildUsers(users).stores;
                ids = users.filter(u => u.teamId === 't0').map(u => u.id);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    const id = `new-${i}`;
                    stores.set(
                        id,
                        createStore<TUser>({
                            id,
                            teamId: 't0',
                            name: `name-0000${i % 10}`,
                            active: true,
                        })
                    );
                    ids.push(id);
                    size = ids
                        .map(k => stores.get(k)!.getState())
                        .sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    subscriptionChurn: (users, rows) => {
        const { stores } = buildUsers(users);
        let stops: { unsubscribe: () => void }[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users
                .slice(from, from + rows)
                .map(u => stores.get(u.id)!.watch(() => undefined));
        return {
            setup: () => {
                for (const stop of stops) stop.unsubscribe();
                stops = subscribe(0);
                offset = 0;
            },
            run: () => {
                for (const stop of stops) stop.unsubscribe();
                offset = (offset + rows) % (users.length - rows);
                stops = subscribe(offset);
            },
            verify: () => stops.length === rows,
        };
    },

    pointUpdate: users => {
        const { stores, setUser } = buildUsers(users);
        let woken = 0;
        for (const u of users) stores.get(u.id)!.watch(() => woken++);
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                setUser({ ...stores.get(target)!.getState(), name: `n${n++}` });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** Effector has no separate effect primitive for this: `.watch` is the side-effect hook. */
    effectDispatch: users => {
        const { stores, setUser } = buildUsers(users);
        let ran = 0;
        for (const u of users) stores.get(u.id)!.watch(() => ran++);
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                setUser({ ...stores.get(target)!.getState(), name: `n${n++}` });
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const { stores } = buildUsers(users);
        const slice = users.slice(0, Math.max(1, users.length / 10));
        const applyBatch = createEvent<string>();
        for (const u of slice) {
            stores.set(
                u.id,
                stores
                    .get(u.id)!
                    .on(applyBatch, (state, name) => ({ ...state, name }))
            );
        }
        let woken = 0;
        for (const u of users) stores.get(u.id)!.watch(() => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                applyBatch(`n${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * One event per rewrite: Effector settles the graph per event, so repeated writes to the same
     * store inside one frame are only coalesced if they arrive as one event. This measures the
     * honest shape — N events for N rewrites.
     */
    burstCoalescing: (users, rewrites) => {
        const { stores } = buildUsers(users);
        const hot = users.slice(0, 100);
        const rewrite = createEvent<string>();
        for (const u of hot) {
            stores.set(
                u.id,
                stores.get(u.id)!.on(rewrite, (state, name) => ({ ...state, name }))
            );
        }
        let woken = 0;
        for (const u of hot) stores.get(u.id)!.watch(() => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (let r = 0; r < rewrites; r++) rewrite(`n${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    fanOutRecompute: (users, derived, updates) => {
        const { stores, setUser } = buildUsers(users);
        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const name = stores.get(users[i].id)!.map(u => {
                recomputes++;
                return u.name;
            });
            name.watch(() => wakeups++);
        }
        const target = users[0].id;
        let n = 0;
        return {
            setup: () => {
                setUser({ ...stores.get(target)!.getState(), name: `settle${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    setUser({
                        ...stores.get(target)!.getState(),
                        name: `n${n++}`,
                    });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    diamondGlitch: (users, updates) => {
        const { stores, setUser } = buildUsers(users);
        const source = stores.get(users[0].id)!;
        const a = source.map(u => u.name.length);
        const b = source.map(u => u.name.toUpperCase());
        let recomputes = 0;
        const c = combine(a, b, (x, y) => {
            recomputes++;
            return `${x}:${y}`;
        });
        let wakeups = 0;
        c.watch(() => wakeups++);
        let n = 0;
        return {
            setup: () => {
                setUser({ ...source.getState(), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    setUser({ ...source.getState(), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    deepGraphGlitch: (users, depth, updates) => {
        const { stores, setUser } = buildUsers(users);
        const source = stores.get(users[0].id)!;
        const chain: Store<string>[] = [];
        chain.push(source.map(u => u.name));
        for (let level = 1; level < depth; level++) {
            chain.push(chain[level - 1].map(value => value));
        }
        const tail = chain[depth - 1];
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = combine(
            [source, tail, ...faces],
            ([user, deep, ...faceValues]) => {
                recomputes++;
                const direct = (user as TUser).name;
                for (const value of faceValues) {
                    if (value !== direct) inconsistencies++;
                }
                if (direct !== deep) inconsistencies++;
                return `${direct}|${deep as string}`;
            }
        );
        let wakeups = 0;
        final.watch(() => wakeups++);
        let n = 0;
        return {
            setup: () => {
                setUser({ ...source.getState(), name: `settle-${n++}` });
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    setUser({ ...source.getState(), name: `name-${n++}` });
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /**
     * The store holds the whole user, so a write to `active` produces a new object and the `.map`
     * over `name` re-runs. Effector then compares the mapped result and stops there, so nothing
     * downstream wakes — the same shape as an entity-level dependency elsewhere.
     */
    unrelatedFieldWakeups: (users, updates) => {
        const { stores, setUser } = buildUsers(users);
        const source = stores.get(users[0].id)!;
        let recomputes = 0;
        const name = source.map(u => {
            recomputes++;
            return u.name;
        });
        let wakeups = 0;
        name.watch(() => wakeups++);
        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                setUser({ ...source.getState(), active: flag });
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    setUser({ ...source.getState(), active: flag });
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => buildUsers(users),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const built = buildUsers(users);
            const stops = users.map(u =>
                built.stores.get(u.id)!.watch(() => undefined)
            );
            return { built, stops };
        },
    }),
};
