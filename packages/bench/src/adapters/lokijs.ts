import Loki from 'lokijs';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: LokiJS's own "Indexing and Query performance" guidance — a unique index on the primary
 * key so `by()` is a hash lookup, and a binary index on any field you filter by.
 * https://techfort.github.io/LokiJS/tutorial-Indexing%20and%20Query%20performance.html
 *
 * Note what is missing: LokiJS is a store with events at the COLLECTION level
 * (`coll.on('update', …)`), not per document. There is no documented way to subscribe to one
 * record, so the point-update scenario is reported as unsupported rather than emulated — emulating
 * it would measure our workaround, not LokiJS.
 */
export const lokiAdapter: TAdapter = {
    name: 'lokijs',
    version: '1.5.12',
    docs: 'https://techfort.github.io/LokiJS/tutorial-Indexing%20and%20Query%20performance.html',

    /**
     * TABLE — a DynamicView per team with `applySimpleSort`: LokiJS keeps the filtered, sorted view
     * up to date on write, so an interaction is a read of a maintained result rather than a fresh
     * chained query. This is its memoising primitive, the counterpart to a computed or a live query.
     */
    taskTable: (users, interactions) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId', 'name'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        const views = new Map<string, ReturnType<typeof coll.addDynamicView>>();
        for (let t = 0; t < 50; t++) {
            const view = coll.addDynamicView(`team${t}`);
            view.applyFind({ teamId: `t${t}` });
            view.applySimpleSort('name');
            views.set(`t${t}`, view);
        }
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = views
                        .get(`t${i % 50}`)!
                        .data()
                        .slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    // taskFeedPush: absent — LokiJS has no per-row subscription, so "which rows woke" has no answer.

    /** DETAIL CARD — a binary index on `userId` for the comments. */
    taskDetailCard: (users, comments, updates) => {
        const db = new Loki('bench.db');
        const usersColl = db.addCollection<TUser>('users', { unique: ['id'] });
        const commentsColl = db.addCollection<TComment>('comments', {
            unique: ['id'],
            indices: ['userId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        usersColl.insert(users.map(u => ({ ...u })));
        commentsColl.insert(comments.map(c => ({ ...c })));
        const pk = users[0].id;
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    const doc = usersColl.by('id', pk);
                    if (doc) {
                        doc.name = `n${n++}`;
                        usersColl.update(doc);
                    }
                    const rows = commentsColl.find({ userId: pk });
                    sink = `${doc?.name ?? ''} — ${rows.length} comments`;
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — one DynamicView per combination, maintained on write. */
    taskFacetSearch: (users, interactions) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId', 'active'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        const views = new Map<string, ReturnType<typeof coll.addDynamicView>>();
        for (let t = 0; t < 10; t++) {
            for (const active of [true, false]) {
                const name = `t${t}:${active}`;
                const view = coll.addDynamicView(name);
                view.applyFind({ teamId: `t${t}` });
                view.applyFind({ active });
                views.set(name, view);
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = views.get(`t${i % 10}:${Math.floor(i / 10) % 2 === 0}`)!.data().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let db: Loki;
        let coll: Collection<TUser>;
        let fresh: TUser[];
        return {
            setup: () => {
                db = new Loki('bench.db');
                coll = db.addCollection<TUser>('users', {
                    unique: ['id'],
                    indices: ['teamId'],
                    // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
                // LokiJS stamps `$loki`/`meta` onto the documents it inserts, so each timed run
                // needs untouched objects. Copying is preparation, not the work being measured —
                // leaving it inside `run` would bill LokiJS for our test setup.
                fresh = users.map(u => ({ ...u }));
            },
            run: () => {
                coll.insert(fresh);
            },
            verify: () => coll.count() === users.length,
        };
    },

    readByPk: (users, reads) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) {
                    sink = coll.by('id', pk);
                }
            },
            verify: () => sink?.id === pk,
        };
    },

    // pointUpdate: intentionally absent — see the note above.

    // LokiJS keeps its binary index up to date on write, so a change between queries costs the
    // index maintenance, not a rescan.
    queryColdByField: (users, queries) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    const doc = coll.by('id', users[0].id);
                    if (doc) {
                        doc.name = `n${n++}`;
                        coll.update(doc);
                    }
                    size = coll.find({ teamId: `t${i % 50}` }).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // There is no result memoisation in LokiJS: an unchanged store still re-runs the query. That is
    // the finding, not a mis-implementation — the docs offer no cached-view primitive for this.
    queryHotByField: (users, queries) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = coll.find({ teamId: `t${i % 50}` }).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const db = new Loki('bench.db');
        const usersColl = db.addCollection<TUser>('users', { unique: ['id'] });
        const commentsColl = db.addCollection<TComment>('comments', {
            unique: ['id'],
            indices: ['userId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        usersColl.insert(users.map(u => ({ ...u })));
        commentsColl.insert(comments.map(c => ({ ...c })));
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = commentsColl.find({
                        userId: `u${i % users.length}`,
                    }).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // computedChain / effectDispatch / subscriptionChurn: intentionally absent. LokiJS has no derived
    // value primitive and no per-document subscription — only collection-level events. See the note
    // at the top of this file.

    /**
     * `coll.update(array)` is the documented bulk write. The per-document `update` event still fires
     * once per document — there is no coalescing layer — which is what the woken count shows.
     * https://techfort.github.io/LokiJS/Collection.html#update
     */
    batchUpdate: users => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        let woken = 0;
        coll.on('update', () => woken++);
        const slice = coll.find().slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (const doc of slice) doc.name = `n${n}`;
                n++;
                coll.update(slice);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * A binary index on the sort field keeps the order maintained on write, and `simplesort` then
     * reads it back without a full sort.
     * https://techfort.github.io/LokiJS/tutorial-Indexing%20and%20Query%20performance.html
     */
    /**
     * A binary index on the sort field, read back with `simplesort`. Rebuilt in `setup` so repeats
     * do not sort an ever-growing collection.
     * https://techfort.github.io/LokiJS/tutorial-Indexing%20and%20Query%20performance.html
     */
    /**
     * Built-in tooling: a DynamicView is LokiJS's persistent, incrementally-maintained filtered view
     * — the documented answer to "a filter you run again and again". One view per facet combination,
     * each holding its own `applyFind` chain.
     * https://techfort.github.io/LokiJS/DynamicView.html
     */
    /**
     * A DynamicView per combination: LokiJS's persistent, incrementally maintained filtered view —
     * its documented answer to a filter you run again and again, and therefore what it should be
     * measured on.
     * https://techfort.github.io/LokiJS/DynamicView.html
     */
    facetedFilter: (users, queries) => {
        const db = new Loki('bench.db');
        const coll = db.addCollection<TUser>('users', {
            unique: ['id'],
            indices: ['teamId', 'active'],
            // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
        coll.insert(users.map(u => ({ ...u })));
        const views = new Map<string, ReturnType<typeof coll.addDynamicView>>();
        for (let t = 0; t < 50; t++) {
            for (const active of [true, false]) {
                const name = `t${t}:${active}`;
                const view = coll.addDynamicView(name);
                view.applyFind({ teamId: `t${t}` });
                view.applyFind({ active });
                views.set(name, view);
            }
        }
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = views.get(`t${i % 50}:${Math.floor(i / 50) % 2 === 0}`)!.data().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    orderedInsert: (users, inserts) => {
        let coll: Collection<TUser>;
        let size = 0;
        return {
            setup: () => {
                const db = new Loki('bench.db');
                coll = db.addCollection<TUser>('users', {
                    unique: ['id'],
                    indices: ['teamId', 'name'],
                    // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
                coll.insert(users.map(u => ({ ...u })));
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    coll.insert({
                        id: `new-${i}`,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    size = coll
                        .chain()
                        .find({ teamId: 't0' })
                        .simplesort('name')
                        .data().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // burstCoalescing: absent — LokiJS has no per-entity subscription to coalesce.

    memoryForEntities: users => ({
        build: () => {
            const db = new Loki('bench.db');
            const coll = db.addCollection<TUser>('users', {
                unique: ['id'],
                indices: ['teamId'],
                // Nothing in this benchmark reads LokiJS's change log; leaving it on costs ~31% of
            // insert time for bookkeeping the library would only need for sync.
            disableChangesApi: true,
        });
            coll.insert(users.map(u => ({ ...u })));
            return { db, coll };
        },
    }),

    // memoryForSubscriptions: absent for the same reason as pointUpdate.
};
