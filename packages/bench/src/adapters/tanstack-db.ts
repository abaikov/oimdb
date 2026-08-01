import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    createTransaction,
    and,
    eq,
    localOnlyCollectionOptions,
} from '@tanstack/db';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: TanStack DB's own docs. `createCollection` with `localOnlyCollectionOptions` is the
 * store-without-sync; `createIndex` builds a maintained index; `createLiveQueryCollection` is the
 * incremental query (differential dataflow, so a change updates the result rather than re-running
 * it); `subscribeChanges` with a `where` is the per-row subscription.
 * https://tanstack.com/db/latest/docs/overview
 * https://tanstack.com/db/latest/docs/guides/live-queries
 * https://tanstack.com/db/latest/docs/guides/collection-options-creator
 */
const buildUsers = (users: TUser[]) => {
    const collection = createCollection(
        localOnlyCollectionOptions({
            getKey: (u: TUser) => u.id,
            defaultIndexType: BasicIndex,
        })
    );
    collection.insert(users);
    return collection;
};

type TUsersCollection = ReturnType<typeof buildUsers>;

/**
 * One live query per key, created once — the documented shape for a parameterised query.
 *
 * Results are materialised on read (`[...values()]`) rather than read as `.size`. A live query keeps
 * a maintained count, so `.size` would answer in O(1) while every other adapter here builds the row
 * list — comparing those two would flatter TanStack DB for work it did not do at read time.
 */
const liveByTeam = (collection: TUsersCollection) => {
    const byTeam = new Map<
        string,
        { values: () => Iterable<TUser>; keys: () => Iterable<string> }
    >();
    for (let t = 0; t < 50; t++) {
        const team = `t${t}`;
        byTeam.set(
            team,
            createLiveQueryCollection({
                query: q => q.from({ u: collection }).where(({ u }) => eq(u.teamId, team)),
                startSync: true,
            })
        );
    }
    return byTeam;
};

export const tanstackDbAdapter: TAdapter = {
    name: '@tanstack/db',
    version: '0.6.17',
    docs: 'https://tanstack.com/db/latest/docs/guides/live-queries',

    /** TABLE — a live query per team with `orderBy`, incrementally maintained; the page is a slice. */
    taskTable: (users, interactions) => {
        const collection = buildUsers(users);
        const sorted = new Map<string, { values: () => Iterable<TUser> }>();
        for (let t = 0; t < 50; t++) {
            const team = `t${t}`;
            sorted.set(
                team,
                createLiveQueryCollection({
                    query: q =>
                        q
                            .from({ u: collection })
                            .where(({ u }) => eq(u.teamId, team))
                            .orderBy(({ u }) => u.name),
                    startSync: true,
                })
            );
        }
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = [...sorted.get(`t${i % 50}`)!.values()].slice(
                        offset,
                        offset + 20
                    );
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — filtered `subscribeChanges` per visible row, one transaction for the push. */
    taskFeedPush: users => {
        const collection = buildUsers(users);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) {
            collection.subscribeChanges(() => woken++, {
                where: (row: TUser) => eq(row.id, u.id),
                includeInitialState: false,
            });
        }
        const ids = [...users.slice(0, 12), ...users.slice(5_000, 5_988)].map(
            u => u.id
        );
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const name = `push-${n++}`;
                collection.update(ids, drafts => {
                    for (const d of drafts) d.name = name;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — a live query for the comments; the caption is assembled from it. */
    taskDetailCard: (users, comments, updates) => {
        const usersColl = buildUsers(users);
        const commentsColl = createCollection(
            localOnlyCollectionOptions({
                getKey: (c: TComment) => c.id,
                defaultIndexType: BasicIndex,
            })
        );
        commentsColl.insert(comments);
        const pk = users[0].id;
        const rows = createLiveQueryCollection({
            query: q => q.from({ c: commentsColl }).where(({ c }) => eq(c.userId, pk)),
            startSync: true,
        });
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    const name = `n${n++}`;
                    usersColl.update(pk, d => {
                        d.name = name;
                    });
                    sink = `${usersColl.get(pk)?.name ?? ''} — ${[...rows.values()].length} comments`;
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — a live query per combination, kept in sync. */
    taskFacetSearch: (users, interactions) => {
        const collection = buildUsers(users);
        const byFacet = new Map<string, { values: () => Iterable<TUser> }>();
        for (let t = 0; t < 10; t++) {
            for (const active of [true, false]) {
                const team = `t${t}`;
                byFacet.set(
                    `${team}:${active}`,
                    createLiveQueryCollection({
                        query: q =>
                            q
                                .from({ u: collection })
                                .where(({ u }) => and(eq(u.teamId, team), eq(u.active, active))),
                        startSync: true,
                    })
                );
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = [
                        ...byFacet.get(`t${i % 10}:${Math.floor(i / 10) % 2 === 0}`)!.values(),
                    ].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let collection: TUsersCollection;
        return {
            setup: () => {
                collection = createCollection(
                    localOnlyCollectionOptions({
                        getKey: (u: TUser) => u.id,
                        defaultIndexType: BasicIndex,
                    })
                );
            },
            run: () => {
                collection.insert(users);
            },
            verify: () => collection.size === users.length,
        };
    },

    readByPk: (users, reads) => {
        const collection = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = collection.get(pk);
            },
            verify: () => sink?.id === pk,
        };
    },

    /** `subscribeChanges` accepts a `where`, so a subscription can be narrowed to one row. */
    pointUpdate: users => {
        const collection = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            collection.subscribeChanges(() => woken++, {
                where: (row: TUser) => eq(row.id, u.id),
                includeInitialState: false,
            });
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const name = `n${n++}`;
                collection.update(target, d => {
                    d.name = name;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    queryColdByField: (users, queries) => {
        const collection = buildUsers(users);
        const byTeam = liveByTeam(collection);
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    const name = `n${n++}`;
                    collection.update(churn, d => {
                        d.name = name;
                    });
                    size = [...byTeam.get(`t${i % 50}`)!.values()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    queryCachedByField: (users, queries) => {
        const collection = buildUsers(users);
        const byTeam = liveByTeam(collection);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = [...byTeam.get(`t${i % 50}`)!.values()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** Keys only: a live query maintains its keys, so this never touches the rows. */
    queryHotKeysOnly: (users, queries) => {
        const collection = buildUsers(users);
        const byTeam = liveByTeam(collection);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = [...byTeam.get(`t${i % 50}`)!.keys()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** Built-in tooling: a live query with a conjunction over both facet fields. */
    facetedFilter: (users, queries) => {
        const collection = buildUsers(users);
        const byFacet = new Map<string, { values: () => Iterable<TUser> }>();
        for (let t = 0; t < 50; t++) {
            for (const active of [true, false]) {
                const team = `t${t}`;
                byFacet.set(
                    `${team}:${active}`,
                    createLiveQueryCollection({
                        query: q =>
                            q
                                .from({ u: collection })
                                .where(({ u }) =>
                                    and(eq(u.teamId, team), eq(u.active, active))
                                ),
                        startSync: true,
                    })
                );
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = [...byFacet.get(`t${i % 50}:${Math.floor(i / 50) % 2 === 0}`)!.values()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const collection = createCollection(
            localOnlyCollectionOptions({
                getKey: (c: TComment) => c.id,
                defaultIndexType: BasicIndex,
            })
        );
        collection.insert(comments);
        const byUser = new Map<string, { values: () => Iterable<TComment> }>();
        for (let i = 0; i < users.length; i++) {
            const userId = `u${i}`;
            byUser.set(
                userId,
                createLiveQueryCollection({
                    query: q =>
                        q.from({ c: collection }).where(({ c }) => eq(c.userId, userId)),
                    startSync: true,
                })
            );
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = [...byUser.get(`u${i % users.length}`)!.values()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // computedChain: absent — TanStack DB's derived primitive is the live query, which is
    // collection-shaped. There is no scalar computed to chain, and expressing a three-level scalar
    // derivation as three collections would measure a construction nobody writes.

    effectDispatch: users => {
        const collection = buildUsers(users);
        let ran = 0;
        for (const u of users) {
            collection.subscribeChanges(() => ran++, {
                where: (row: TUser) => eq(row.id, u.id),
                includeInitialState: false,
            });
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                const name = `n${n++}`;
                collection.update(target, d => {
                    d.name = name;
                });
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const collection = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            collection.subscribeChanges(() => woken++, {
                where: (row: TUser) => eq(row.id, u.id),
                includeInitialState: false,
            });
        }
        const ids = users.slice(0, Math.max(1, users.length / 10)).map(u => u.id);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const name = `n${n++}`;
                collection.update(ids, drafts => {
                    for (const d of drafts) d.name = name;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    burstCoalescing: (users, rewrites) => {
        const collection = buildUsers(users);
        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) {
            collection.subscribeChanges(() => woken++, {
                where: (row: TUser) => eq(row.id, u.id),
                includeInitialState: false,
            });
        }
        const ids = hot.map(u => u.id);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                // `createTransaction().mutate` is TanStack DB's frame. Measured result: it does NOT
                // coalesce — each optimistic `update` notifies immediately, so 100 rows rewritten
                // N times produce 100×N notifications, not 100. Grouping the writes changes when
                // they commit, not how many times subscribers are woken.
                const tx = createTransaction({ mutationFn: async () => undefined });
                tx.mutate(() => {
                    for (let r = 0; r < rewrites; r++) {
                        const name = `n${n++}`;
                        collection.update(ids, drafts => {
                            for (const d of drafts) d.name = name;
                        });
                    }
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    subscriptionChurn: (users, rows) => {
        const collection = buildUsers(users);
        let stops: { unsubscribe: () => void }[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users.slice(from, from + rows).map(u =>
                collection.subscribeChanges(() => undefined, {
                    where: (row: TUser) => eq(row.id, u.id),
                    includeInitialState: false,
                })
            );
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

    /** A live query with `orderBy` — incrementally maintained, not re-sorted per read. */
    orderedInsert: (users, inserts) => {
        let collection: TUsersCollection;
        let ordered: { values: () => Iterable<TUser> };
        let size = 0;
        return {
            setup: () => {
                collection = buildUsers(users);
                ordered = createLiveQueryCollection({
                    query: q =>
                        q
                            .from({ u: collection })
                            .where(({ u }) => eq(u.teamId, 't0'))
                            .orderBy(({ u }) => u.name),
                    startSync: true,
                });
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    collection.insert({
                        id: `new-${i}`,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    size = [...ordered.values()].length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    memoryForEntities: users => ({
        build: () => ({ collection: buildUsers(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const collection = buildUsers(users);
            const stops = users.map(u =>
                collection.subscribeChanges(() => undefined, {
                    where: (row: TUser) => eq(row.id, u.id),
                    includeInitialState: false,
                })
            );
            return { collection, stops };
        },
    }),
};
