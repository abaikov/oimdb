import { Collection, createIndex } from '@signaldb/core';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Reads use `fetch()`, not `count()`: a count can be answered without building the result, and every
 * other adapter here builds it.
 *
 * Recipe: SignalDB's own guides. A `Collection` with `createIndex` field indices, MongoDB-shaped
 * `find`/`findOne` with `sort`, `batch` for grouped writes, and a cursor's `observeChanges` as the
 * subscription — the framework-free half of its reactivity story.
 * https://signaldb.js.org/reference/core/collection/
 * https://signaldb.js.org/guides/indexes/
 *
 * SignalDB's reactivity in a component is normally supplied by a reactivity adapter (Angular, Vue,
 * Solid…). Outside a framework the documented primitive is `observeChanges`, which is what the
 * subscription scenarios use.
 */
const buildUsers = (users: TUser[]) => {
    const collection = new Collection<TUser>({
        indices: [createIndex('teamId'), createIndex('active')],
    });
    collection.batch(() => {
        for (const u of users) collection.insert(u);
    });
    return collection;
};

export const signaldbAdapter: TAdapter = {
    name: 'signaldb',
    version: '1.8.1',
    docs: 'https://signaldb.js.org/guides/indexes/',

    /**
     * TABLE — `find` with `sort`, `skip` and `limit`, SignalDB's own paging options. There is no
     * memoising primitive to put in front of it (reactivity comes from the host framework's adapter,
     * not from the database), so unlike the other adapters this row is real work on every
     * interaction. That is the library's shape, not a handicap imposed here.
     */
    taskTable: (users, interactions) => {
        const collection = buildUsers(users);
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    page = collection
                        .find(
                            { teamId: `t${i % 50}` },
                            { sort: { name: 1 }, skip: (i % 5) * 20, limit: 20 }
                        )
                        .fetch();
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — a cursor per visible row, and one `batch` for the whole push. */
    taskFeedPush: users => {
        const collection = buildUsers(users);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) {
            collection.find({ id: u.id }).observeChanges({ changed: () => woken++ });
        }
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                collection.batch(() => {
                    for (const u of pushed) {
                        collection.updateOne({ id: u.id }, { $set: { name: `push-${n}` } });
                    }
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — a second collection with an index on `userId`. */
    taskDetailCard: (users, comments, updates) => {
        const usersColl = buildUsers(users);
        const commentsColl = new Collection<TComment>({
            indices: [createIndex('userId')],
        });
        commentsColl.batch(() => {
            for (const c of comments) commentsColl.insert(c);
        });
        const pk = users[0].id;
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    usersColl.updateOne({ id: pk }, { $set: { name: `n${n++}` } });
                    const rows = commentsColl.find({ userId: pk }).fetch();
                    sink = `${usersColl.findOne({ id: pk })?.name ?? ''} — ${rows.length} comments`;
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — both facet fields are indexed; SignalDB combines them itself. */
    taskFacetSearch: (users, interactions) => {
        const collection = buildUsers(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = collection
                        .find({ teamId: `t${i % 10}`, active: Math.floor(i / 10) % 2 === 0 })
                        .fetch().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let collection: Collection<TUser>;
        return {
            setup: () => {
                collection = new Collection<TUser>({
                    indices: [createIndex('teamId'), createIndex('active')],
                });
            },
            run: () => {
                collection.batch(() => {
                    for (const u of users) collection.insert(u);
                });
            },
            verify: () => collection.find({}).count() === users.length,
        };
    },

    readByPk: (users, reads) => {
        const collection = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) {
                    sink = collection.findOne({ id: pk });
                }
            },
            verify: () => sink?.id === pk,
        };
    },

    pointUpdate: users => {
        const collection = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            collection.find({ id: u.id }).observeChanges({ changed: () => woken++ });
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                collection.updateOne(
                    { id: target },
                    { $set: { name: `n${n++}` } }
                );
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    queryColdByField: (users, queries) => {
        const collection = buildUsers(users);
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    collection.updateOne(
                        { id: churn },
                        { $set: { name: `n${n++}` } }
                    );
                    size = collection.find({ teamId: `t${i % 50}` }).fetch()
                        .length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    queryHotByField: (users, queries) => {
        const collection = buildUsers(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = collection.find({ teamId: `t${i % 50}` }).fetch()
                        .length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * Built-in tooling: field indices on both facet fields, queried together. SignalDB picks the
     * indices up itself — nothing hand-rolled.
     */
    facetedFilter: (users, queries) => {
        const collection = buildUsers(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = collection
                        .find({ teamId: `t${i % 50}`, active: Math.floor(i / 50) % 2 === 0 })
                        .fetch().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const collection = new Collection<TComment>({
            indices: [createIndex('userId')],
        });
        collection.batch(() => {
            for (const c of comments) collection.insert(c);
        });
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = collection
                        .find({ userId: `u${i % users.length}` })
                        .fetch().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // computedChain: absent — SignalDB is a database, not a reactivity system. Derived values are
    // expected to come from the host framework's own computed primitive through a reactivity
    // adapter, so measuring one here would measure Vue or Solid, not SignalDB.

    effectDispatch: users => {
        const collection = buildUsers(users);
        let ran = 0;
        for (const u of users) {
            collection.find({ id: u.id }).observeChanges({ changed: () => ran++ });
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                collection.updateOne(
                    { id: target },
                    { $set: { name: `n${n++}` } }
                );
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const collection = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            collection.find({ id: u.id }).observeChanges({ changed: () => woken++ });
        }
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                collection.batch(() => {
                    for (const u of slice) {
                        collection.updateOne(
                            { id: u.id },
                            { $set: { name: `n${n}` } }
                        );
                    }
                    n++;
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
            collection.find({ id: u.id }).observeChanges({ changed: () => woken++ });
        }
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                collection.batch(() => {
                    for (let r = 0; r < rewrites; r++) {
                        for (const u of hot) {
                            collection.updateOne(
                                { id: u.id },
                                { $set: { name: `n${n}` } }
                            );
                        }
                        n++;
                    }
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    subscriptionChurn: (users, rows) => {
        const collection = buildUsers(users);
        let stops: (() => void)[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users
                .slice(from, from + rows)
                .map(u =>
                    collection
                        .find({ id: u.id })
                        .observeChanges({ changed: () => undefined })
                );
        return {
            setup: () => {
                for (const stop of stops) stop();
                stops = subscribe(0);
                offset = 0;
            },
            run: () => {
                for (const stop of stops) stop();
                offset = (offset + rows) % (users.length - rows);
                stops = subscribe(offset);
            },
            verify: () => stops.length === rows,
        };
    },

    /** `sort` is part of the query — SignalDB's own ordering, not a hand-rolled comparator. */
    orderedInsert: (users, inserts) => {
        let collection: Collection<TUser>;
        let size = 0;
        return {
            setup: () => {
                collection = buildUsers(users);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    collection.insert({
                        id: `new-${i}`,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    size = collection.find(
                        { teamId: 't0' },
                        { sort: { name: 1 } }
                    ).fetch().length;
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
                collection
                    .find({ id: u.id })
                    .observeChanges({ changed: () => undefined })
            );
            return { collection, stops };
        },
    }),
};
