import {
    createTable,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type ColumnDef,
    type TableState,
} from '@tanstack/table-core';
import type { TAdapter, TUser } from '../harness/types';

/**
 * Recipe: the headless core. `createTable` plus the row models you opt into — the framework adapters
 * (react-table etc.) only wire state into a component, so driving `setOptions` by hand is the
 * documented framework-free usage.
 * https://tanstack.com/table/latest/docs/guide/table-state
 * https://tanstack.com/table/latest/docs/guide/column-faceting
 *
 * TanStack Table is a VIEW layer over an array you already hold — it has no store, no primary-key
 * lookup, no subscriptions and no writes. Every scenario about storing, reading by id or reacting to
 * change is therefore absent by nature, not by omission. What it does have, and what it is measured
 * on here, is filtering, faceting and sorting.
 */
const columns: ColumnDef<TUser>[] = [
    { id: 'id', accessorKey: 'id' },
    { id: 'teamId', accessorKey: 'teamId' },
    { id: 'name', accessorKey: 'name' },
    { id: 'active', accessorKey: 'active' },
];

/** The headless boilerplate the framework adapters normally hide. */
const makeTable = (data: TUser[]) => {
    let state = {} as TableState;
    const table = createTable<TUser>({
        data,
        columns,
        state: {},
        onStateChange: () => undefined,
        renderFallbackValue: null,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
    state = table.initialState;
    table.setOptions(prev => ({
        ...prev,
        state,
        onStateChange: updater => {
            state =
                typeof updater === 'function'
                    ? (updater as (s: TableState) => TableState)(state)
                    : updater;
            table.setOptions(next => ({ ...next, state }));
        },
    }));
    return table;
};

export const tanstackTableAdapter: TAdapter = {
    name: '@tanstack/table-core',
    version: '8.21.3',
    docs: 'https://tanstack.com/table/latest/docs/guide/column-faceting',

    /**
     * TABLE — this is the library's entire purpose: column filter, sorting and pagination row
     * models, each memoised against the table state.
     */
    taskTable: (users, interactions) => {
        const table = makeTable(users);
        table.setPageSize(20);
        let page: unknown[] = [];
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    table.setColumnFilters([{ id: 'teamId', value: `t${i % 50}` }]);
                    table.setSorting([{ id: 'name', desc: false }]);
                    table.setPageIndex(i % 5);
                    page = table.getPaginationRowModel().rows;
                }
            },
            verify: () => page.length === 20,
            result: () => page.length,
        };
    },

    /** FACET SEARCH — two column filters; the row model is memoised per state. */
    taskFacetSearch: (users, interactions) => {
        const table = makeTable(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < interactions; i++) {
                    table.setColumnFilters([
                        { id: 'teamId', value: `t${i % 10}` },
                        { id: 'active', value: Math.floor(i / 50) % 2 === 0 },
                    ]);
                    size = table.getFilteredRowModel().rows.length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    // taskFeedPush / taskDetailCard: absent — no subscriptions, no relations, no writes.

    /**
     * Built-in tooling: column filters drive `getFilteredRowModel`, and the faceted row models are
     * the library's own answer to "filter by several columns at once". The result is memoised per
     * state, so a repeated combination is a cache hit and a changed one is a recompute — which is
     * why this row is far slower than an indexed lookup: every distinct facet pair invalidates it.
     */
    facetedFilter: (users, queries) => {
        const table = makeTable(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    table.setColumnFilters([
                        { id: 'teamId', value: `t${i % 50}` },
                        { id: 'active', value: Math.floor(i / 50) % 2 === 0 },
                    ]);
                    size = table.getFilteredRowModel().rows.length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** The same single-field filter as everyone else's `query`, through the column-filter path. */
    queryColdByField: (users, queries) => {
        const table = makeTable(users);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    table.setColumnFilters([
                        { id: 'teamId', value: `t${i % 50}` },
                    ]);
                    size = table.getFilteredRowModel().rows.length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /** Same filter re-read without changing state: the row model answers from its memo. */
    queryHotByField: (users, queries) => {
        const table = makeTable(users);
        table.setColumnFilters([{ id: 'teamId', value: 't0' }]);
        let size = 0;
        return {
            setup: () => undefined,
            run: () => {
                for (let i = 0; i < queries; i++) {
                    size = table.getFilteredRowModel().rows.length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * Sorting is `getSortedRowModel`, recomputed when the underlying rows change. TanStack cannot
     * insert — the array is owned by the caller — so an insert here means handing the table a new
     * array, which is exactly what a React app does on every server push.
     */
    orderedInsert: (users, inserts) => {
        let table: ReturnType<typeof makeTable>;
        let data: TUser[];
        let size = 0;
        return {
            setup: () => {
                data = users.filter(u => u.teamId === 't0');
                table = makeTable(data);
                table.setSorting([{ id: 'name', desc: false }]);
            },
            run: () => {
                for (let i = 0; i < inserts; i++) {
                    data = [
                        ...data,
                        {
                            id: `new-${i}`,
                            teamId: 't0',
                            name: `name-0000${i % 10}`,
                            active: true,
                        },
                    ];
                    const rows = data;
                    table.setOptions(prev => ({ ...prev, data: rows }));
                    size = table.getSortedRowModel().rows.length;
                }
            },
            verify: () => size > 0,
            result: () => size,
        };
    },

    /**
     * The row models and their memo caches, on top of the array the caller already owns — so this
     * number is the VIEW's overhead, not the cost of holding the data.
     */
    memoryForEntities: users => ({
        build: () => {
            const table = makeTable(users);
            table.setColumnFilters([{ id: 'teamId', value: 't0' }]);
            table.getFilteredRowModel();
            // Faceting lives on the column, not the table.
            table.getColumn('teamId')?.getFacetedRowModel();
            return { table };
        },
    }),

    // load / readByPk / pointUpdate / computedChain / effectDispatch / batchUpdate /
    // burstCoalescing / subscriptionChurn / relatedLookup / memoryForSubscriptions:
    // absent by nature — TanStack Table is a view layer, not a store. See the note above.
};
