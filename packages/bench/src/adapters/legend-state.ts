import { batch, computed, observable, observe } from '@legendapp/state';
import type { TAdapter, TComment, TUser } from '../harness/types';

/**
 * Recipe: Legend-State's own docs. An `observable` object keyed by id gives per-node tracking —
 * `users[id].onChange` fires only for that node — `computed` is the derived value, `observe` is the
 * effect, and `batch` groups writes.
 * https://legendapp.com/open-source/state/v2/intro/introduction/
 * https://legendapp.com/open-source/state/v2/usage/reactivity/
 *
 * Legend-State is a fine-grained state library, not a database: it has no index and no query. Where
 * this file builds one, the doc comment says so.
 */
type TUserMap = Record<string, TUser>;

const buildUsers = (users: TUser[]) => {
    const state = observable<TUserMap>({});
    batch(() => {
        for (const u of users) state[u.id].set(u);
    });
    return state;
};

/**
 * A REACTIVE index: the grouping lives in a `computed`, so Legend-State tracks the nodes it read and
 * a write invalidates it. A Map built once from the source array is a snapshot that goes stale the
 * moment an entity changes team; keeping it correct costs an O(n) regroup per write.
 */
const reactiveIndex = <TKey extends string>(
    state: ReturnType<typeof observable<TUserMap>>,
    ids: readonly string[],
    keyOf: (u: TUser) => TKey
) =>
    computed(() => {
        const byKey = new Map<TKey, TUser[]>();
        for (const id of ids) {
            const u = state[id].get();
            if (!u) continue;
            const key = keyOf(u);
            const bucket = byKey.get(key);
            if (bucket) bucket.push(u);
            else byKey.set(key, [u]);
        }
        return byKey;
    });

export const legendStateAdapter: TAdapter = {
    name: '@legendapp/state',
    version: '2.1.15',
    docs: 'https://legendapp.com/open-source/state/v2/usage/reactivity/',

    /** TABLE — ⚠ HAND-ROLLED index and sort: Legend-State has no query layer at all. */
    taskTable: (users, interactions) => {
        const state = buildUsers(users);
        const byTeam = reactiveIndex(state, users.map(u => u.id), u => u.teamId);
        // The sorted list per team goes behind a `computed`, Legend-State's own memoising primitive
        // — sorting inline on every interaction would compare their real work against the cache hit
        // every other adapter here gets.
        const teamRows = new Map<string, { get: () => unknown }>();
        const rowsFor = (team: string) => {
            let memo = teamRows.get(team);
            if (!memo) {
                memo = computed(() =>
                    [
                        ...((byTeam.get() as Map<string, TUser[]>).get(team) ??
                            []),
                    ].sort((a, b) =>
                        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                    )
                );
                teamRows.set(team, memo);
            }
            return memo;
        };
        let page: TUser[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    const offset = (i % 5) * 20;
                    page = (rowsFor(`t${i % 50}`).get() as TUser[]).slice(
                        offset,
                        offset + 20
                    );
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FEED PUSH — per-node `onChange` for the visible rows, one `batch` for the push. */
    taskFeedPush: users => {
        const state = buildUsers(users);
        const visible = users.slice(0, 200);
        let woken = 0;
        for (const u of visible) state[u.id].onChange(() => woken++);
        const pushed = [...users.slice(0, 12), ...users.slice(5_000, 5_988)];
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                batch(() => {
                    for (const u of pushed) state[u.id].name.set(`push-${n}`);
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /** DETAIL CARD — computeds for the list, count and caption; ⚠ the relation index is ours. */
    taskDetailCard: (users, comments, updates) => {
        const state = buildUsers(users);
        const commentState = observable<Record<string, TComment>>({});
        batch(() => {
            for (const c of comments) commentState[c.id].set(c);
        });
        const pk = users[0].id;
        const commentIds = comments.filter(c => c.userId === pk).map(c => c.id);
        const rows = computed(() => commentIds.map(id => commentState[id].get()));
        const count = computed(() => (rows.get() as TComment[]).length);
        const caption = computed(
            () => `${state[pk].name.get() ?? ''} — ${count.get() as number} comments`
        );
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    state[pk].name.set(`n${n++}`);
                    sink = caption.get() as string;
                }
            },
            verify: () => sink.includes('comments'),
        };
    },

    /** FACET SEARCH — ⚠ HAND-ROLLED composite index. */
    taskFacetSearch: (users, interactions) => {
        const state = buildUsers(users);
        const byFacet = reactiveIndex(state, users.map(u => u.id), u => `${u.teamId}:${u.active}` as const);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    size = ((byFacet.get() as Map<string, TUser[]>).get(
                        `t${i % 10}:${Math.floor(i / 10) % 2 === 0}`
                    ) ?? []).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    load: users => {
        let state: ReturnType<typeof observable<TUserMap>>;
        return {
            setup: () => {
                state = observable<TUserMap>({});
            },
            run: () => {
                batch(() => {
                    for (const u of users) state[u.id].set(u);
                });
            },
            verify: () => state[users[0].id].get()?.id === users[0].id,
        };
    },

    readByPk: (users, reads) => {
        const state = buildUsers(users);
        const pk = users[users.length >> 1].id;
        let sink: TUser | undefined;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < reads; i++) sink = state[pk].get();
            },
            verify: () => sink?.id === pk,
        };
    },

    pointUpdate: users => {
        const state = buildUsers(users);
        let woken = 0;
        for (const u of users) state[u.id].onChange(() => woken++);
        const target = users[users.length >> 1].id;
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                state[target].name.set(`n${n++}`);
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    /**
     * ⚠ HAND-ROLLED index. Legend-State has no query or index tooling, in core or in its ecosystem
     * (`@legendapp/state/sync*` covers persistence and sync, not querying). The Map below is ours,
     * so this row measures this file, not the library; what Legend-State itself offers for
     * "everyone on team X" is a scan of the observable.
     */
    queryColdByField: (users, queries) => {
        const state = buildUsers(users);
        const byTeam = reactiveIndex(state, users.map(u => u.id), u => u.teamId);
        const churn = users[0].id;
        let size = 0;
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    state[churn].name.set(`n${n++}`);
                    size = ((byTeam.get() as Map<string, TUser[]>).get(`t${i % 50}`) ?? []).length;
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


    /** ⚠ HAND-ROLLED composite index — Legend-State has no faceting of any kind. */
    facetedFilter: (users, queries) => {
        const state = buildUsers(users);
        const byFacet = reactiveIndex(state, users.map(u => u.id), u => `${u.teamId}:${u.active}` as const);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = ((byFacet.get() as Map<string, TUser[]>).get(
                        `t${i % 50}:${Math.floor(i / 50) % 2 === 0}`
                    ) ?? []).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** ⚠ HAND-ROLLED index over comments — same reason. */
    relatedLookup: (_users, comments, queries) => {
        const state = observable<Record<string, TComment>>({});
        batch(() => {
            for (const c of comments) state[c.id].set(c);
        });
        const idsByUser = new Map<string, string[]>();
        for (const c of comments) {
            const bucket = idsByUser.get(c.userId);
            if (bucket) bucket.push(c.id);
            else idsByUser.set(c.userId, [c.id]);
        }
        const keys = [...idsByUser.keys()];
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = (idsByUser.get(keys[i % keys.length]) ?? []).map(id =>
                        state[id].get()
                    ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** Built-in tooling: `computed` is Legend-State's derived value and composes with itself. */
    computedChain: (users, updates) => {
        const state = buildUsers(users);
        const pk = users[users.length >> 1].id;
        const level1 = computed(() => state[pk].name.get() ?? '');
        const level2 = computed(() => (level1.get() as string).toUpperCase());
        const level3 = computed(() => `${level2.get() as string}!`);
        let sink = '';
        let n = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < updates; i++) {
                    state[pk].name.set(`n${n++}`);
                    sink = level3.get() as string;
                }
            },
            verify: () => sink.endsWith('!'),
        };
    },

    /** Built-in tooling: `observe` is the effect, tracking exactly what it read. */
    effectDispatch: users => {
        const state = buildUsers(users);
        let ran = 0;
        for (const u of users) {
            observe(() => {
                state[u.id].name.get();
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
                state[target].name.set(`n${n++}`);
            },
            verify: () => ran > 0,
            ran: () => ran,
        };
    },

    batchUpdate: users => {
        const state = buildUsers(users);
        let woken = 0;
        for (const u of users) state[u.id].onChange(() => woken++);
        const slice = users.slice(0, Math.max(1, users.length / 10));
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                batch(() => {
                    for (const u of slice) state[u.id].name.set(`n${n}`);
                    n++;
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    burstCoalescing: (users, rewrites) => {
        const state = buildUsers(users);
        let woken = 0;
        const hot = users.slice(0, 100);
        for (const u of hot) state[u.id].onChange(() => woken++);
        let n = 0;
        return {
            setup: () => {
                woken = 0;
            },
            run: () => {
                batch(() => {
                    for (let r = 0; r < rewrites; r++) {
                        for (const u of hot) state[u.id].name.set(`n${n}`);
                        n++;
                    }
                });
            },
            verify: () => woken > 0,
            woken: () => woken,
        };
    },

    subscriptionChurn: (users, rows) => {
        const state = buildUsers(users);
        let stops: (() => void)[] = [];
        let offset = 0;
        const subscribe = (from: number) =>
            users
                .slice(from, from + rows)
                .map(u => state[u.id].onChange(() => undefined));
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

    /** ⚠ HAND-ROLLED ordering — Legend-State has no sorted structure. */
    orderedInsert: (users, inserts) => {
        let state: ReturnType<typeof observable<TUserMap>>;
        let ids: string[];
        let size = 0;
        return {
            setup: () => {
                state = buildUsers(users);
                ids = users.filter(u => u.teamId === 't0').map(u => u.id);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    const id = `new-${i}`;
                    state[id].set({
                        id,
                        teamId: 't0',
                        name: `name-0000${i % 10}`,
                        active: true,
                    });
                    ids.push(id);
                    size = ids
                        .map(k => state[k].get())
                        .sort((a, b) =>
                            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
                        ).length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    fanOutRecompute: (users, derived, updates) => {
        const state = buildUsers(users);
        let recomputes = 0;
        let wakeups = 0;
        for (let i = 0; i < derived; i++) {
            const id = users[i].id;
            const name = computed(() => {
                recomputes++;
                return state[id].name.get() ?? '';
            });
            observe(() => {
                name.get();
                wakeups++;
            });
        }
        const target = users[0].id;
        let n = 0;
        return {
            setup: () => {
                state[target].name.set(`settle${n++}`);
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    state[target].name.set(`n${n++}`);
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    diamondGlitch: (users, updates) => {
        const state = buildUsers(users);
        const id = users[0].id;
        const a = computed(() => (state[id].name.get() ?? '').length);
        const b = computed(() => (state[id].name.get() ?? '').toUpperCase());
        let recomputes = 0;
        const c = computed(() => {
            recomputes++;
            return `${a.get() as number}:${b.get() as string}`;
        });
        let wakeups = 0;
        observe(() => {
            c.get();
            wakeups++;
        });
        let n = 0;
        return {
            setup: () => {
                state[id].name.set(`settle-${n++}`);
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    state[id].name.set(`name-${n++}`);
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    /** Deep diamond — see the oimdb adapter for what this shape is testing. */
    deepGraphGlitch: (users, depth, updates) => {
        const state = buildUsers(users);
        const id = users[0].id;

        const chain: Array<{ get: () => unknown }> = [];
        chain.push(computed(() => state[id].name.get() ?? ''));
        for (let level = 1; level < depth; level++) {
            const previous = chain[level - 1];
            chain.push(computed(() => previous.get() as string));
        }
        const tail = chain[depth - 1];

        const faces = chain.filter((_, level) => level % 2 === 1);
        let recomputes = 0;
        let inconsistencies = 0;
        const final = computed(() => {
            recomputes++;
            const direct = state[id].name.get() ?? '';
            for (const face of faces) {
                if ((face.get() as string) !== direct) inconsistencies++;
            }
            const deep = tail.get() as string;
            if (direct !== deep) inconsistencies++;
            return `${direct}|${deep}`;
        });
        let wakeups = 0;
        observe(() => {
            final.get();
            wakeups++;
        });

        let n = 0;
        return {
            setup: () => {
                state[id].name.set(`settle-${n++}`);
                recomputes = 0;
                wakeups = 0;
                inconsistencies = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    state[id].name.set(`name-${n++}`);
                }
            },
            verify: () => recomputes > 0,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
            inconsistencies: () => inconsistencies,
        };
    },

    /**
     * Legend-State tracks per NODE, and the computed reads `state[id].name` — so a write to
     * `state[id].active` is not even a dependency. Expect zero recomputes, not merely zero wakeups:
     * this is the axis on which its granularity is finer than a per-entity subscription.
     */
    unrelatedFieldWakeups: (users, updates) => {
        const state = buildUsers(users);
        const id = users[0].id;
        let recomputes = 0;
        const name = computed(() => {
            recomputes++;
            return state[id].name.get() ?? '';
        });
        let wakeups = 0;
        observe(() => {
            name.get();
            wakeups++;
        });
        let flag = false;
        return {
            setup: () => {
                flag = !flag;
                state[id].active.set(flag);
                recomputes = 0;
                wakeups = 0;
            },
            run: () => {
                for (let i = 0; i < updates; i++) {
                    flag = !flag;
                    state[id].active.set(flag);
                }
            },
            verify: () => true,
            recomputes: () => recomputes,
            wakeups: () => wakeups,
        };
    },

    memoryForEntities: users => ({
        build: () => ({ state: buildUsers(users) }),
    }),

    memoryForSubscriptions: users => ({
        build: () => {
            const state = buildUsers(users);
            const stops = users.map(u => state[u.id].onChange(() => undefined));
            return { state, stops };
        },
    }),
};
