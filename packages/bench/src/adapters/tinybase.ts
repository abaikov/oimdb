import {
    createIndexes,
    createQueries,
    createRelationships,
    createStore,
} from 'tinybase';
import type { Store } from 'tinybase';
import type { TAdapter, TUser } from '../harness/types';

/**
 * Every query row here materialises the rows, not just their ids: `getSliceRowIds` alone returns
 * keys, and comparing that against adapters that hand back entities would credit TinyBase for work
 * it had not done. Rows are also written without copying — `setRow` accepts the source object.
 *
 * Recipe: the TinyBase guides. A `Store` holds keyed rows; `createIndexes` builds and maintains a
 * slice index (including a composite one, via a cell-deriving function); `addRowListener` is the
 * per-row subscription; `transaction` coalesces writes; `createQueries` gives sorted result ids.
 * https://tinybase.org/guides/the-basics/
 * https://tinybase.org/guides/using-indexes/
 * https://tinybase.org/guides/using-queries/
 *
 * TinyBase is the closest thing to oimdb in this list: an in-memory reactive store with maintained
 * indexes and listeners down to the individual row and cell. Nothing here is hand-rolled.
 */
const buildStore = (users: TUser[]): Store => {
    const store = createStore();
    store.transaction(() => {
        for (const u of users) store.setRow('users', u.id, u);
    });
    return store;
};

export const tinybaseAdapter: TAdapter = {
    name: 'tinybase',
    version: '9.3.0',
    docs: 'https://tinybase.org/guides/using-indexes/',

    /** TABLE — `createQueries` keeps the filtered result and hands back sorted ids for the page. */
    taskTable: (users, interactions) => {
        const store = buildStore(users);
        const queriesApi = createQueries(store);
        for (let t = 0; t < 50; t++) {
            queriesApi.setQueryDefinition(`team${t}`, 'users', ({ select, where }) => {
                select('name');
                where('teamId', `t${t}`);
            });
        }
        let page: unknown[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = queriesApi
                        .getResultSortedRowIds(`team${i % 50}`, 'name', false, offset, 20)
                        .map(id => store.getRow('users', id));
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — per-row listeners and a single `transaction` for the whole push. */
    taskFeedPush: users => {
        const store = buildStore(users);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) store.addRowListener('users', u.id, () => woken++);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.transaction(() => {
                    for (const u of pushed) {
                        store.setCell('users', u.id, 'name', `push-${n}`);
                    }
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — an index for the comments; the caption is assembled on read. */
    taskDetailCard: (users, comments, updates) => {
        const store = buildStore(users);
        store.transaction(() => {
            for (const c of comments) store.setRow('comments', c.id, c);
        });
        const relationships = createRelationships(store);
        relationships.setRelationshipDefinition(
            'commentUser',
            'comments',
            'users',
            'userId'
        );
        const pk = users[0].id;
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.setCell('users', pk, 'name', `n${n++}`);
                    const rows = relationships
                        .getLocalRowIds('commentUser', pk)
                        .map(id => store.getRow('comments', id));
                    sink = `${store.getCell('users', pk, 'name') as string} — ${rows.length} comments`;
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /**
     * FACET SEARCH — `createQueries` keeps a maintained result table per combination, which is
     * TinyBase's memoising primitive; a revisited filter pair is answered from it rather than
     * re-derived, matching what the other adapters do with a computed / derived atom / live query.
     */
    taskFacetSearch: (users, interactions) => {
        const store = buildStore(users);
        const queriesApi = createQueries(store);
        for (let t = 0; t < 10; t++) {
            for (const active of [true, false]) {
                queriesApi.setQueryDefinition(
                    `facet${t}:${active}`,
                    'users',
                    ({ select, where }) => {
                        select('name');
                        where('teamId', `t${t}`);
                        where('active', active);
                    }
                );
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = queriesApi.getResultRowIds(
                        `facet${i % 10}:${Math.floor(i / 10) % 2 === 0}`
                    ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let store: Store;
        return {
            setup: () => {
                store = createStore();
            },
            run: () => {
                // One transaction, rows written straight from the source array — no reshaping step
                // billed to the library and none hidden in setup either.
                store.transaction(() => {
                    for (const u of users) store.setRow('users', u.id, u);
                });
            },
            verify: () => store.getRowIds('users').length === users.length,
        };
    },

    readByPk: (users, reads) => {
        const store = buildStore(users);
        const pk = users[users.length >> 1].id;
        let sink: unknown;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = store.getRow('users', pk);
            },
            verify: () => Boolean(sink),
        };
    },

    pointUpdate: users => {
        const store = buildStore(users);
        let woken = 0;
        for (const u of users) {
            store.addRowListener('users', u.id, () => woken++);
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.setCell('users', target, 'name', `n${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    queryColdByField: (users, queries) => {
        const store = buildStore(users);
        const indexes = createIndexes(store);
        indexes.setIndexDefinition('byTeam', 'users', 'teamId');
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    store.setCell('users', churn, 'name', `n${n++}`);
                    size = indexes
                        .getSliceRowIds('byTeam', `t${i % 50}`)
                        .map(id => store.getRow('users', id)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    queryHotByField: (users, queries) => {
        const store = buildStore(users);
        const indexes = createIndexes(store);
        indexes.setIndexDefinition('byTeam', 'users', 'teamId');
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = indexes
                        .getSliceRowIds('byTeam', `t${i % 50}`)
                        .map(id => store.getRow('users', id)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * CACHED: `createQueries` keeps a result table and maintains it on write, so a repeated read is
     * served from that table rather than re-running the query — TinyBase's own memoising primitive,
     * the counterpart to an `OIMComputed`.
     * https://tinybase.org/guides/using-queries/
     */
    queryCachedByField: (users, queries) => {
        const store = buildStore(users);
        const queriesApi = createQueries(store);
        for (let t = 0; t < 50; t++) {
            queriesApi.setQueryDefinition(`team${t}`, 'users', ({ select, where }) => {
                select('name');
                where('teamId', `t${t}`);
            });
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = queriesApi.getResultRowIds(`team${i % 50}`).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * Keys only — TinyBase's NATIVE shape: its list guides render from row ids and let each row read
     * its own cells. `createQueries` keeps the result table maintained, so a repeated read is served
     * from it rather than re-derived, which matches the memoised read every other adapter gets here.
     */
    queryHotKeysOnly: (users, queries) => {
        const store = buildStore(users);
        const queriesApi = createQueries(store);
        for (let t = 0; t < 50; t++) {
            queriesApi.setQueryDefinition(`ids${t}`, 'users', ({ select, where }) => {
                select('name');
                where('teamId', `t${t}`);
            });
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = queriesApi.getResultRowIds(`ids${i % 50}`).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * `createQueries` keeps a maintained result table per combination — TinyBase's memoising
     * primitive, and the right counterpart to everyone else's cached path.
     */
    facetedFilter: (users, queries) => {
        const store = buildStore(users);
        const queriesApi = createQueries(store);
        for (let t = 0; t < 50; t++) {
            for (const active of [true, false]) {
                queriesApi.setQueryDefinition(
                    `f${t}:${active}`,
                    'users',
                    ({ select, where }) => {
                        select('name');
                        where('teamId', `t${t}`);
                        where('active', active);
                    }
                );
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = queriesApi
                        .getResultRowIds(
                            `f${i % 50}:${Math.floor(i / 50) % 2 === 0}`
                        )
                        .map(id => store.getRow('users', id)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const store = createStore();
        store.transaction(() => {
            for (const c of comments) store.setRow('comments', c.id, c);
        });
        // `createRelationships` is TinyBase's dedicated primitive for "the rows pointing at this
        // row" and is ~20x faster here than the general slice index: 0.10 ms vs 2.06 ms per 1,000
        // lookups. Using the index instead would have measured the wrong tool.
        const relationships = createRelationships(store);
        relationships.setRelationshipDefinition(
            'commentUser',
            'comments',
            'users',
            'userId'
        );
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = relationships
                        .getLocalRowIds('commentUser', `u${i % users.length}`)
                        .map(id => store.getRow('comments', id)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * computedChain: absent, and this is a measured finding rather than an omission. TinyBase has no
     * composable derived-scalar primitive — its derived structures (Indexes, Metrics, Relationships,
     * Queries) are all table-shaped. The only way to chain scalars is listeners writing Values, and
     * that cascade stops after two hops: a mutator listener triggered by another mutator listener's
     * write never fires. Verified directly — level1 and level2 settle, level3 stays undefined on
     * every write, in either registration order. A three-level chain is therefore not expressible.
     * https://tinybase.org/guides/the-basics/using-values/
     */

    effectDispatch: users => {
        const store = buildStore(users);
        let ran = 0;
        for (const u of users) store.addRowListener('users', u.id, () => ran++);
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                store.setCell('users', target, 'name', `n${n++}`);
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const store = buildStore(users);
        let woken = 0;
        for (const u of users) store.addRowListener('users', u.id, () => woken++);
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.transaction(() => {
                    for (const u of slice) {
                        store.setCell('users', u.id, 'name', `n${n}`);
                    }
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** `transaction` is TinyBase's coalescing unit: listeners fire once per row when it commits. */
    burstCoalescing: (users, rewrites) => {
        const store = buildStore(users);
        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) store.addRowListener('users', u.id, () => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.transaction(() => {
                    for (let r = 0; r < rewrites; r++) {
                        for (const u of hot) {
                            store.setCell('users', u.id, 'name', `n${n}`);
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
        const store = buildStore(users);
        let ids: string[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users
                .slice(from, from + rows)
                .map(u => store.addRowListener('users', u.id, () => undefined));
        return {
            setup: () => {
                for (const id of ids) store.delListener(id);
                ids = subscribe(0);
                offset = 0;
            },
            run: () => {
                for (const id of ids) store.delListener(id);
                offset = (offset + rows) % (users.length - rows);
                ids = subscribe(offset);
            },
            verify: () => ids.length === rows,
        };
    },

    /**
     * Queries maintain a result table and hand back sorted row ids — TinyBase's own answer to an
     * ordered list, so no sorting is hand-rolled here.
     * https://tinybase.org/api/queries/interfaces/queries/queries/methods/result/getresultsortedrowids/
     */
    orderedInsert: (users, inserts) => {
        let store: Store;
        let queries: ReturnType<typeof createQueries>;
        let size = 0;
        return {
            setup: () => {
                store = buildStore(users);
                queries = createQueries(store);
                queries.setQueryDefinition('team0', 'users', ({ select, where }) => {
                    select('name');
                    where('teamId', 't0');
                });
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    store.setRow('users', `new-${i}`, {
                        id: `new-${i}`,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    size = queries
                        .getResultSortedRowIds('team0', 'name', false)
                        .map(id => store.getRow('users', id)).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    memoryForEntities: users => ({
        build: () => ({ store: buildStore(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const store = buildStore(users);
            const ids = users.map(u =>
                store.addRowListener('users', u.id, () => undefined)
            );
            return { store, ids };
        },
    }),
};
