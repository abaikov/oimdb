import {
    autorun,
    computed as mobxComputed,
    configure,
    observable,
    reaction,
    runInAction,
} from 'mobx';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: MobX's own guides. `observable.map` holds the entities, each value an observable object;
 * `computed` is the derived value; `reaction` is the effect with an explicit dependency expression;
 * `runInAction` is the write batch.
 * https://mobx.js.org/observable-state.html
 * https://mobx.js.org/computeds.html
 * https://mobx.js.org/reactions.html
 *
 * `enforceActions: 'never'` because this file writes outside actions on purpose in the scenarios
 * that measure a bare write; the batching scenarios use `runInAction` explicitly, which is what a
 * MobX app does for a burst.
 *
 * MobX is a reactivity system, not a database: it has no index and no query. Where a lookup needs
 * one, the doc comment says the index is ours.
 */
configure({ enforceActions: 'never' });

type TObservableUser = TUser;

const buildUsers = (users: TUser[]) => {
    const map = observable.map<string, TObservableUser>();
    runInAction(() => {
        for (const u of users) map.set(u.id, observable({ ...u }));
    });
    return map;
};

/**
 * A REACTIVE index: the grouping is rebuilt inside a `computed`, so MobX tracks every entity it read
 * and a write invalidates it.
 *
 * The obvious shortcut is a plain Map built once from the source array — but that Map is not an
 * index, it is a snapshot: move an entity to another team and it silently answers the old
 * membership forever. Comparing that against a store whose index is maintained on write measures
 * nothing. The honest version costs an O(n) rebuild whenever anything changes, and that cost IS the
 * finding: a reactivity library without an index pays for correctness in full on every write.
 */
const reactiveIndex = <TKey extends string>(
    map: ReturnType<typeof observable.map<string, TObservableUser>>,
    keyOf: (u: TUser) => TKey
) =>
    // `keepAlive` matters: a MobX computed that nothing OBSERVES is not memoised at all — it
    // recomputes on every `.get()`. Without it this index rebuilt 10,000 entities per query and
    // reported 9.6 s where the library really costs milliseconds. Outside a reaction, keepAlive is
    // how MobX's own docs say to hold a computed's value.
    // https://mobx.js.org/computeds.html#computedwithkeepalive
    mobxComputed(
        () => {
            const byKey = new Map<TKey, TUser[]>();
            for (const u of map.values()) {
                const key = keyOf(u);
                const bucket = byKey.get(key);
                if (bucket) bucket.push(u);
                else byKey.set(key, [u]);
            }
            return byKey;
        },
        { keepAlive: true }
    );

export const mobxAdapter: TAdapter = {
    name: 'mobx',
    version: '6.16.1',
    docs: 'https://mobx.js.org/computeds.html',

    /**
     * TABLE — ⚠ the index is HAND-ROLLED (MobX has no query layer); the sorted page behind it is a
     * `computed`, which is MobX's memoisation and the reason a revisited team is cheap.
     */
    taskTable: (users, interactions) => {
        const map = buildUsers(users);
        const byTeam = reactiveIndex(map, u => u.teamId);
        const sorted = new Map<string, { get: () => TUser[] }>();
        const rowsFor = (team: string) => {
            let memo = sorted.get(team);
            if (!memo) {
                memo = mobxComputed(
                    () =>
                        [...(byTeam.get().get(team) ?? [])].sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        ),
                    { keepAlive: true }
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
                        .get()
                        .slice(offset, offset + 20);
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — one `reaction` per visible row, the whole push inside a single action. */
    taskFeedPush: users => {
        const map = buildUsers(users);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) {
            reaction(
                () => map.get(u.id)!.name,
                () => woken++
            );
        }
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                runInAction(() => {
                    for (const u of pushed) map.get(u.id)!.name = `push-${n}`;
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — computeds for the comment list, its count and the caption. */
    taskDetailCard: (users, comments, updates) => {
        const map = buildUsers(users);
        const commentMap = observable.map<string, TComment>();
        runInAction(() => {
            for (const c of comments) commentMap.set(c.id, observable({ ...c }));
        });
        const pk = users[0].id;
        // ⚠ HAND-ROLLED relation index.
        const commentIds = comments.filter(c => c.userId === pk).map(c => c.id);
        const rows = mobxComputed(() => commentIds.map(id => commentMap.get(id)!));
        const count = mobxComputed(() => rows.get().length);
        const caption = mobxComputed(
            () => `${map.get(pk)!.name} — ${count.get()} comments`
        );
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    map.get(pk)!.name = `n${n++}`;
                    sink = caption.get();
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — ⚠ HAND-ROLLED composite index, each combination behind a `computed`. */
    taskFacetSearch: (users, interactions) => {
        const map = buildUsers(users);
        const byFacet = reactiveIndex(map, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, { get: () => TUser[] }>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = mobxComputed(() => byFacet.get().get(key) ?? [], {
                    keepAlive: true,
                });
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
                    ).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let map: ReturnType<typeof observable.map<string, TObservableUser>>;
        return {
            setup: () => {
                map = observable.map<string, TObservableUser>();
            },
            run: () => {
                runInAction(() => {
                    for (const u of users) map.set(u.id, observable({ ...u }));
                });
            },
            verify: () => map.size === users.length,
        };
    },

    readByPk: (users, reads) => {
        const map = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = map.get(pk);
            },
            verify: () => sink?.id === pk,
        };
    },

    /** ⚠ HAND-ROLLED index; the write between queries invalidates the computed behind it. */
    queryColdByField: (users, queries) => {
        const map = buildUsers(users);
        const byTeam = reactiveIndex(map, u => u.teamId);
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    map.get(churn)!.name = `n${n++}`;
                    size = (byTeam.get().get(`t${i % 50}`) ?? []).length;
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


    /** CACHED: `computed` is MobX's memoisation, one per team. */
    queryCachedByField: (users, queries) => {
        const map = buildUsers(users);
        const byTeam = reactiveIndex(map, u => u.teamId);
        const memos = new Map<string, { get: () => TUser[] }>();
        const rowsFor = (team: string) => {
            let memo = memos.get(team);
            if (!memo) {
                memo = mobxComputed(() => byTeam.get().get(team) ?? [], {
                    keepAlive: true,
                });
                memos.set(team, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`t${i % 50}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED composite index behind a `computed` per combination. */
    facetedFilter: (users, queries) => {
        const map = buildUsers(users);
        const byFacet = reactiveIndex(map, u => `${u.teamId}:${u.active}` as const);
        const memos = new Map<string, { get: () => TUser[] }>();
        const facet = (key: string) => {
            let memo = memos.get(key);
            if (!memo) {
                memo = mobxComputed(() => byFacet.get().get(key) ?? [], {
                    keepAlive: true,
                });
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
                    ).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED relation index behind a `computed` per user. */
    relatedLookup: (users, comments, queries) => {
        const commentMap = observable.map<string, TComment>();
        runInAction(() => {
            for (const c of comments) commentMap.set(c.id, observable({ ...c }));
        });
        const idsByUser = new Map<string, string[]>();
        for (const c of comments) {
            const bucket = idsByUser.get(c.userId);
            if (bucket) bucket.push(c.id);
            else idsByUser.set(c.userId, [c.id]);
        }
        const memos = new Map<string, { get: () => TComment[] }>();
        const rowsFor = (userId: string) => {
            let memo = memos.get(userId);
            if (!memo) {
                memo = mobxComputed(
                    () => (idsByUser.get(userId) ?? []).map(id => commentMap.get(id)!),
                    { keepAlive: true }
                );
                memos.set(userId, memo);
            }
            return memo;
        };
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = rowsFor(`u${i % users.length}`).get().length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    computedChain: (users, updates) => {
        const map = buildUsers(users);
        const pk = users[users.length >> 1].id;
        const level1 = mobxComputed(() => map.get(pk)!.name);
        const level2 = mobxComputed(() => level1.get().toUpperCase());
        const level3 = mobxComputed(() => `${level2.get()}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    map.get(pk)!.name = `n${n++}`;
                    sink = level3.get();
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    /** ⚠ HAND-ROLLED ordered list — MobX has no sorted structure. */
    orderedInsert: (users, inserts) => {
        let map: ReturnType<typeof observable.map<string, TObservableUser>>;
        let ids: string[];
        let size = 0;
        return {
            setup: () => {
                map = buildUsers(users);
                ids = users.filter(u => u.teamId === 't0').map(u => u.id);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    const id = `new-${i}`;
                    runInAction(() => {
                        map.set(
                            id,
                            observable({
                                id,
                                teamId: 't0',
                                name: `name-0000${i % 10}`,
                                active: true,
                            })
                        );
                    });
                    ids.push(id);
                    size = ids
                        .map(k => map.get(k)!)
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
        const map = buildUsers(users);
        let stops: (() => void)[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users.slice(from, from + rows).map(u =>
                reaction(
                    () => map.get(u.id)!.name,
                    () => undefined
                )
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

    pointUpdate: users => {
        const map = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            reaction(
                () => map.get(u.id)!.name,
                () => woken++
            );
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                map.get(target)!.name = `n${n++}`;
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    effectDispatch: users => {
        const map = buildUsers(users);
        let ran = 0;
        for (const u of users) {
            autorun(() => {
                map.get(u.id)!.name;
                ran++;
            });
        }
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                ran = 0;
            },
            run: () => {
                map.get(target)!.name = `n${n++}`;
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const map = buildUsers(users);
        let woken = 0;
        for (const u of users) {
            reaction(
                () => map.get(u.id)!.name,
                () => woken++
            );
        }
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                runInAction(() => {
                    for (const u of slice) map.get(u.id)!.name = `n${n}`;
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** `runInAction` is MobX's frame: reactions run once at the end, not per assignment. */
    burstCoalescing: (users, rewrites) => {
        const map = buildUsers(users);
        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) {
            reaction(
                () => map.get(u.id)!.name,
                () => woken++
            );
        }
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                runInAction(() => {
                    for (let r = 0; r < rewrites; r++) {
                        for (const u of hot) map.get(u.id)!.name = `n${n}`;
                        n++;
                    }
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    fanOutRecompute: (users, derived, updates) => {
        const map = buildUsers(users);
        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const id = users[i].id;
            const name = mobxComputed(() => {
                recomputes++;
                return map.get(id)!.name;
            });
            autorun(() => {
                name.get();
                wakeups++;
            });
        }
        const target = users[0].id;
        let n = 0;
        return {
            setup: () => {
                map.get(target)!.name = `settle${n++}`;
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    map.get(target)!.name = `n${n++}`;
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    diamondGlitch: (users, updates) => {
        const map = buildUsers(users);
        const pk = users[0].id;
        const a = mobxComputed(() => map.get(pk)!.name.length);
        const b = mobxComputed(() => map.get(pk)!.name.toUpperCase());
        let recomputes = 0;
        const c = mobxComputed(() => {
            recomputes++;
            return `${a.get()}:${b.get()}`;
        });
        let wakeups = 0;
        autorun(() => {
            c.get();
            wakeups++;
        });
        let n = 0;
        return {
            setup: () => {
                map.get(pk)!.name = `settle-${n++}`;
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    map.get(pk)!.name = `name-${n++}`;
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    deepGraphGlitch: (users, depth, updates) => {
        const map = buildUsers(users);
        const pk = users[0].id;
        const chain: { get: () => string }[] = [];
        chain.push(mobxComputed(() => map.get(pk)!.name));
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            chain.push(mobxComputed(() => previous.get()));
        }
        const tail = chain[depth - 1];
        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = mobxComputed(() => {
            recomputes++;
            const direct = map.get(pk)!.name;
            for (const face of faces) {
                if (face.get() !== direct) inconsistencies++;
            }
            const deep = tail.get();
            if (direct !== deep) inconsistencies++;
            return `${direct}|${deep}`;
        });
        let wakeups = 0;
        autorun(() => {
            final.get();
            wakeups++;
        });
        let n = 0;
        return {
            setup: () => {
                map.get(pk)!.name = `settle-${n++}`;
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    map.get(pk)!.name = `name-${n++}`;
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /**
     * MobX tracks property reads, so a computed that reads `name` never depends on `active` — the
     * write is not even an invalidation. Its granularity is per property, like Legend-State's.
     */
    unrelatedFieldWakeups: (users, updates) => {
        const map = buildUsers(users);
        const pk = users[0].id;
        let recomputes = 0;
        const name = mobxComputed(() => {
            recomputes++;
            return map.get(pk)!.name;
        });
        let wakeups = 0;
        autorun(() => {
            name.get();
            wakeups++;
        });
        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                map.get(pk)!.active = flag;
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    map.get(pk)!.active = flag;
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => ({ map: buildUsers(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const map = buildUsers(users);
            const stops = users.map(u =>
                reaction(
                    () => map.get(u.id)!.name,
                    () => undefined
                )
            );
            return { map, stops };
        },
    }),
};
