import {
    configureStore,
    createEntityAdapter,
    createSlice,
} from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: Redux Toolkit's normalised-state guide plus reselect for derived data. `createEntityAdapter`
 * is the documented way to hold entities (`{ids, entities}`), its generated selectors are the reads,
 * and `createSelector` memoises anything derived.
 * https://redux-toolkit.js.org/api/createEntityAdapter
 * https://redux.js.org/usage/deriving-data-selectors
 *
 * The model has one consequence that shapes every subscription number below, and it is the library's
 * design rather than a handicap: `store.subscribe` is GLOBAL. Redux notifies every subscriber on
 * every dispatch and expects each one to re-run its selector and bail out if the result is
 * unchanged. There is no per-entity subscription to compare against a keyed one, so the scenarios
 * that count "how many of N woke" report the honest number: all of them.
 *
 * `immutableCheck` and `serializableCheck` are off — they are development-only middleware that RTK
 * itself disables in production builds, and leaving them on would measure the dev harness.
 */
const entityAdapter = createEntityAdapter<TUser>();
const commentAdapter = createEntityAdapter<TComment>();

const usersSlice = createSlice({
    name: 'users',
    initialState: entityAdapter.getInitialState(),
    reducers: {
        setAll: entityAdapter.setAll,
        upsertOne: entityAdapter.upsertOne,
        upsertMany: entityAdapter.upsertMany,
        addOne: entityAdapter.addOne,
    },
});

const commentsSlice = createSlice({
    name: 'comments',
    initialState: commentAdapter.getInitialState(),
    reducers: { setAll: commentAdapter.setAll },
});

type TRootState = {
    users: ReturnType<typeof usersSlice.reducer>;
    comments: ReturnType<typeof commentsSlice.reducer>;
};

const makeStore = () =>
    configureStore({
        reducer: {
            users: usersSlice.reducer,
            comments: commentsSlice.reducer,
        },
        middleware: getDefault =>
            getDefault({ immutableCheck: false, serializableCheck: false }),
    });

const userSelectors = entityAdapter.getSelectors((s: TRootState) => s.users);
const commentSelectors = commentAdapter.getSelectors((s: TRootState) => s.comments);

const buildStore = (users: TUser[]) => {
    const store = makeStore();
    store.dispatch(usersSlice.actions.setAll(users));
    return store;
};

export const reduxToolkitAdapter: TAdapter = {
    name: '@reduxjs/toolkit',
    version: '2.10.1',
    docs: 'https://redux-toolkit.js.org/api/createEntityAdapter',

    /** TABLE — a memoised selector per team does the filter and the sort; the page is a slice. */
    taskTable: (users, interactions) => {
        const store = buildStore(users);
        const selectorFor = new Map<string, (s: TRootState) => TUser[]>();
        const rowsFor = (team: string) => {
            let selector = selectorFor.get(team);
            if (!selector) {
                selector = createSelector([userSelectors.selectAll], all =>
                    all
                        .filter(u => u.teamId === team)
                        .sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        )
                );
                selectorFor.set(team, selector);
            }
            return selector;
        };
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = rowsFor(`t${i % 50}`)(store.getState()).slice(
                        offset,
                        offset + 20
                    );
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /**
     * FEED PUSH — one dispatch carries the whole push (`upsertMany`), which is the correct Redux
     * shape. Every subscriber still wakes: notification is global, and filtering per row is the
     * subscriber's job.
     */
    taskFeedPush: users => {
        const store = buildStore(users);
        let woken = 0;
        // 200 "mounted rows", each a subscriber that would re-read its own entity.
        for (let i = 0; i < 200; i++) store.subscribe(() => woken++);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const name = `push-${n++}`;
                store.dispatch(
                    usersSlice.actions.upsertMany(
                        pushed.map(u => ({ ...u, name }))
                    )
                );
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — memoised selectors for the comment list, its count and the caption. */
    taskDetailCard: (users, comments, updates) => {
        const store = buildStore(users);
        store.dispatch(commentsSlice.actions.setAll(comments));
        const pk = users[0].id;
        const selectRows = createSelector([commentSelectors.selectAll], all =>
            all.filter(c => c.userId === pk)
        );
        const selectCount = createSelector([selectRows], rows => rows.length);
        const selectCaption = createSelector(
            [(s: TRootState) => userSelectors.selectById(s, pk), selectCount],
            (user, total) => `${user?.name ?? ''} — ${total} comments`
        );
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.dispatch(
                        usersSlice.actions.upsertOne({
                            ...userSelectors.selectById(store.getState(), pk)!,
                            name: `n${n++}`,
                        })
                    );
                    sink = selectCaption(store.getState());
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — a memoised selector per combination. */
    taskFacetSearch: (users, interactions) => {
        const store = buildStore(users);
        const selectorFor = new Map<string, (s: TRootState) => TUser[]>();
        const facet = (team: string, active: boolean) => {
            const key = `${team}:${active}`;
            let selector = selectorFor.get(key);
            if (!selector) {
                selector = createSelector([userSelectors.selectAll], all =>
                    all.filter(u => u.teamId === team && u.active === active)
                );
                selectorFor.set(key, selector);
            }
            return selector;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = facet(
                        `t${i % 10}`,
                        Math.floor(i / 10) % 2 === 0
                    )(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let store: ReturnType<typeof makeStore>;
        return {
            setup: () => {
                store = makeStore();
            },
            run: () => {
                store.dispatch(usersSlice.actions.setAll(users));
            },
            verify: () =>
                userSelectors.selectTotal(store.getState()) === users.length,
        };
    },

    readByPk: (users, reads) => {
        const store = buildStore(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                const state = store.getState();
                for (let i = 0; i < reads; i++) {
                    sink = userSelectors.selectById(state, pk);
                }
            },
            verify: () => sink?.id === pk,
        };
    },

    /**
     * COLD — a dispatch between queries produces a new state object, so every memoised selector is
     * invalidated and the full scan re-runs. This is the structural cost of derived data in Redux
     * and the reason `createEntityAdapter` ships no secondary index.
     */
    queryColdByField: (users, queries) => {
        const store = buildStore(users);
        const selectorFor = new Map<string, (s: TRootState) => TUser[]>();
        const rowsFor = (team: string) => {
            let selector = selectorFor.get(team);
            if (!selector) {
                selector = createSelector([userSelectors.selectAll], all =>
                    all.filter(u => u.teamId === team)
                );
                selectorFor.set(team, selector);
            }
            return selector;
        };
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    store.dispatch(
                        usersSlice.actions.upsertOne({
                            ...userSelectors.selectById(store.getState(), churn)!,
                            name: `n${n++}`,
                        })
                    );
                    size = rowsFor(`t${i % 50}`)(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** LIVE — a plain filter over `selectAll`, no memoisation in front. */
    queryHotByField: (users, queries) => {
        const store = buildStore(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                const state = store.getState();
                for (let i = 0; i < queries; i++) {
                    const team = `t${i % 50}`;
                    size = userSelectors
                        .selectAll(state)
                        .filter(u => u.teamId === team).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** CACHED — `createSelector` is the memo, one per team. */
    queryCachedByField: (users, queries) => {
        const store = buildStore(users);
        const selectorFor = new Map<string, (s: TRootState) => TUser[]>();
        const rowsFor = (team: string) => {
            let selector = selectorFor.get(team);
            if (!selector) {
                selector = createSelector([userSelectors.selectAll], all =>
                    all.filter(u => u.teamId === team)
                );
                selectorFor.set(team, selector);
            }
            return selector;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`t${i % 50}`)(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    facetedFilter: (users, queries) => {
        const store = buildStore(users);
        const selectorFor = new Map<string, (s: TRootState) => TUser[]>();
        const facet = (team: string, active: boolean) => {
            const key = `${team}:${active}`;
            let selector = selectorFor.get(key);
            if (!selector) {
                selector = createSelector([userSelectors.selectAll], all =>
                    all.filter(u => u.teamId === team && u.active === active)
                );
                selectorFor.set(key, selector);
            }
            return selector;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = facet(
                        `t${i % 50}`,
                        Math.floor(i / 50) % 2 === 0
                    )(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    relatedLookup: (users, comments, queries) => {
        const store = buildStore(users);
        store.dispatch(commentsSlice.actions.setAll(comments));
        const selectorFor = new Map<string, (s: TRootState) => TComment[]>();
        const rowsFor = (userId: string) => {
            let selector = selectorFor.get(userId);
            if (!selector) {
                selector = createSelector([commentSelectors.selectAll], all =>
                    all.filter(c => c.userId === userId)
                );
                selectorFor.set(userId, selector);
            }
            return selector;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`u${i % users.length}`)(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    computedChain: (users, updates) => {
        const store = buildStore(users);
        const pk = users[users.length >> 1].id;
        const level1 = createSelector(
            [(s: TRootState) => userSelectors.selectById(s, pk)],
            user => user?.name ?? ''
        );
        const level2 = createSelector([level1], name => name.toUpperCase());
        const level3 = createSelector([level2], name => `${name}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    store.dispatch(
                        usersSlice.actions.upsertOne({
                            ...userSelectors.selectById(store.getState(), pk)!,
                            name: `n${n++}`,
                        })
                    );
                    sink = level3(store.getState());
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    orderedInsert: (users, inserts) => {
        let store: ReturnType<typeof makeStore>;
        let selectOrdered: (s: TRootState) => TUser[];
        let size = 0;
        return {
            setup: () => {
                store = buildStore(users);
                selectOrdered = createSelector([userSelectors.selectAll], all =>
                    all
                        .filter(u => u.teamId === 't0')
                        .sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        )
                );
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    store.dispatch(
                        usersSlice.actions.addOne({
                            id: `new-${i}`,
                            teamId: 't0',
                            name: `name-0000${i % 10}`,
                            active: true,
                        })
                    );
                    size = selectOrdered(store.getState()).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    subscriptionChurn: (users, rows) => {
        const store = buildStore(users);
        let stops: (() => void)[] = [];
        return {
            setup: () => {
                for (const stop of stops) stop();
                stops = Array.from({ length: rows }, () =>
                    store.subscribe(() => undefined)
                );
            },
            run: () => {
                for (const stop of stops) stop();
                stops = Array.from({ length: rows }, () =>
                    store.subscribe(() => undefined)
                );
            },
            verify: () => stops.length === rows,
        };
    },

    /** Notification is global: one dispatch wakes every subscriber, by design. */
    pointUpdate: users => {
        const store = buildStore(users);
        let woken = 0;
        for (let i = 0; i < users.length; i++) store.subscribe(() => woken++);
        const pk = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                store.dispatch(
                    usersSlice.actions.upsertOne({
                        ...userSelectors.selectById(store.getState(), pk)!,
                        name: `n${n++}`,
                    })
                );
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    effectDispatch: users => {
        const store = buildStore(users);
        let ran = 0;
        for (let i = 0; i < users.length; i++) store.subscribe(() => ran++);
        const pk = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                store.dispatch(
                    usersSlice.actions.upsertOne({
                        ...userSelectors.selectById(store.getState(), pk)!,
                        name: `n${n++}`,
                    })
                );
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const store = buildStore(users);
        let woken = 0;
        for (let i = 0; i < users.length; i++) store.subscribe(() => woken++);
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                const name = `n${n++}`;
                store.dispatch(
                    usersSlice.actions.upsertMany(
                        slice.map(u => ({ ...u, name }))
                    )
                );
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** One dispatch per rewrite: Redux coalesces within a dispatch, not across them. */
    burstCoalescing: (users, rewrites) => {
        const store = buildStore(users);
        const hot = users.slice(0, 100);
        let woken = 0;
        for (let i = 0; i < 100; i++) store.subscribe(() => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                for (let r = 0; r < rewrites; r++) {
                    const name = `n${n++}`;
                    store.dispatch(
                        usersSlice.actions.upsertMany(
                            hot.map(u => ({ ...u, name }))
                        )
                    );
                }
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    // fanOutRecompute / diamondGlitch / deepGraphGlitch / unrelatedFieldWakeups: absent.
    // Reselect memoises, but there is no dependency GRAPH to schedule — a selector is pulled when a
    // subscriber runs, not pushed when its input changes. The questions those scenarios ask (how
    // many derived values recomputed for one write, did the final node see a torn pair) have no
    // meaning in a pull model, and inventing an answer would measure this file.

    memoryForEntities: users => ({
        build: () => ({ store: buildStore(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const store = buildStore(users);
            const stops = users.map(() => store.subscribe(() => undefined));
            return { store, stops };
        },
    }),
};
