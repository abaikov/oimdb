import type { TExoBindable, TExoBindableList } from '@exodra/reactivity-types';
import {
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMReactiveIndexSetBased,
    createOIMOrderedListCommandStreamDiffDriven,
} from '@oimdb/core';
import type { TOIMCollectionKit, TOIMKey } from '@oimdb/core';
import type { TOIMExodraCollection } from './types/TOIMExodraCollection';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { exoChildren } from './exoChildren';
import { exoKeyed } from './exoKeyed';
import { exoList } from './exoList';
import { exoSelector } from './exoSelector';
import { exoSource } from './exoSource';

/* eslint-disable @typescript-eslint/no-explicit-any -- see note below */
/*
 * Index kinds are dispatched ONCE, at facade construction, by `instanceof` against four distinct base
 * classes; the public types resolve the same fork statically (`TOIMExodraIndexFacade`). TypeScript
 * cannot follow a value across that fork, so the bodies below are written against loose shapes while
 * the exported signature — which is what every caller sees — carries the precision. These `any`s are
 * confined to construction and never reach the API surface or a read.
 */
type TAny = any;

/**
 * Turn an OIMDB collection kit into its Exodra-side view: the exoskeleton over the collection.
 *
 * ```ts
 * const users = exoCollection(usersKit, { byTeam, byTeamOrdered, online });
 *
 * users.byPk('u1')                          // TExoBindable<User | undefined>
 * users.byTeam('t1')                        // entities for a key — the index kind is inferred
 * users.byTeamOrdered.rows('t1', render)    // → bindables.children
 * users.byTeamOrdered.list('t1', render)    // → bindableLists.children, ordered indexes only
 *
 * const live = users.byTeam.for(selectedTeam);   // pin to a MOVING key…
 * live.rows(render)                              // …and nothing downstream takes a key again
 * ```
 *
 * Every index you name becomes ONE member carrying everything you can do with it, so the caller never
 * picks a method to match the index kind and never passes the index object again. No function here
 * accepts more than one shape of argument: a fixed key and a moving one are different members, not
 * one member that inspects what it was given.
 *
 * `indexes` is a separate argument because a kit does not own its indexes — `kit.indexFactory`
 * creates them and the app keeps them.
 */
export function exoCollection<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndexes extends Record<string, unknown> = Record<string, never>,
>(
    kit: TOIMCollectionKit<TEntity, TPk>,
    indexes?: TIndexes
): TOIMExodraCollection<TEntity, TPk, TIndexes> {
    if (!kit || typeof kit !== 'object' || !('select' in kit) || !('queue' in kit)) {
        throw new Error(
            'exoCollection: first argument must be a collection kit from `createOIMCollectionKit`, ' +
                'not a collection or `kit.select`.'
        );
    }

    const byPk = (pk: TPk): TExoBindable<TEntity | undefined> =>
        exoSelector(kit.select.byPk(pk));

    const facade: Record<string, unknown> = {
        kit,
        byPk,
        byPks: (pks: readonly TPk[]) => exoSelector(kit.select.byPks(pks)),
        /*
         * Every entity, reactively. Two jobs, both of which used to need hand-rolled glue:
         * it keeps whole-collection reads (the `<option>` lists of a form) from going stale, and it
         * is the change signal to hand `exoCombine` when a row KEY depends on another collection.
         */
        all: () =>
            cachedArray<TEntity>(
                () => kit.collection.getAll(),
                onChange => kit.collection.subscribeOnAnyUpdate(() => onChange())
            ),
    };

    for (const [name, index] of Object.entries(indexes ?? {})) {
        // Without this an index named `byPk` would quietly take the entity reader's place, and one
        // named `kit` would remove the way back to OIMDB — both failing much later and elsewhere.
        if (name in facade) {
            throw new Error(
                `exoCollection: index name "${name}" collides with a built-in member ` +
                    `(${Object.keys(facade).join(', ')}). Rename the index.`
            );
        }
        facade[name] = createIndexFacade(kit, byPk, index as TAny);
    }

    return facade as TOIMExodraCollection<TEntity, TPk, TIndexes>;
}

function createIndexFacade<TEntity extends object, TPk extends TOIMKey>(
    kit: TOIMCollectionKit<TEntity, TPk>,
    byPk: (pk: TPk) => TExoBindable<TEntity | undefined>,
    index: TAny
): TAny {
    const select = kit.select as TAny;
    const isOrdered = index instanceof OIMReactiveIndexArrayBased;
    const isKeyedSet = index instanceof OIMReactiveIndexSetBased;
    const isGlobalArray = index instanceof OIMReactiveGlobalIndexArrayBased;
    const isGlobalSet = index instanceof OIMReactiveGlobalIndexSetBased;

    if (!isOrdered && !isKeyedSet && !isGlobalArray && !isGlobalSet) {
        throw new Error(
            'exoCollection: not a reactive index. Pass instances created by `kit.indexFactory.*` ' +
                '(derivedSetIndex / derivedArrayIndex / composite* / *GlobalIndex).'
        );
    }

    const rowsFrom = <TSchema>(
        pks: TExoBindable<readonly TPk[]>,
        render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ) =>
        exoChildren(pks, {
            key: (pk: TPk) => pk,
            render: (pk: TPk) => render(byPk(pk), pk),
        });

    if (isGlobalArray || isGlobalSet) {
        const selector = () =>
            isGlobalArray
                ? select.entitiesByArrayGlobalIndex(index)
                : select.entitiesBySetGlobalIndex(index);
        const pks = () => cachedArray(() => Array.from(index.getPks()), on => index.subscribe(on));
        const entities = () => exoSelector(selector());
        return Object.assign(entities, {
            pks,
            compact: () => compacted(selector()),
            unsafeDense: () =>
                entities() as unknown as TExoBindable<readonly TEntity[]>,
            rows: <TSchema>(
                render: (e: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
            ) => rowsFrom(pks(), render),
            subscribe: (onChange: () => void) => entities().subscribe(onChange),
        });
    }

    // Composite indexes ARE set/array indexes whose key is a path, so the selector is chosen per call
    // from the key's shape rather than from the index's class.
    const selectorFor = (key: TAny) => {
        const composite = Array.isArray(key);
        if (isOrdered) {
            return composite
                ? select.entitiesByCompositeArrayIndexKey(index, key)
                : select.entitiesByArrayIndexKey(index, key);
        }
        return composite
            ? select.entitiesByCompositeSetIndexKey(index, key)
            : select.entitiesBySetIndexKey(index, key);
    };

    const pksFor = (key: TAny) =>
        cachedArray(
            () => Array.from(index.getPksByKey(key)),
            on => index.subscribeOnKey(key, on)
        );

    const entitiesFor = (key: TAny) => exoSelector(selectorFor(key));

    // One stream per ordered index, shared across keys — it buffers per key internally.
    let stream: TAny;
    const list = <TSchema>(
        key: TOIMKey,
        render: (e: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ): TExoBindableList<TSchema> => {
        stream ??= createOIMOrderedListCommandStreamDiffDriven(kit.queue, index as TAny);
        return exoList(stream, key, (slot: TAny) =>
            render(byPk(slot.pk as TPk), slot.pk as TPk)
        );
    };

    /** Pin to a moving key: everything below takes no key, and repoints when the bindable moves. */
    const forKey = (key: TOIMExodraReadable<TAny>): TAny => {
        const entities = () => exoKeyed(key, (k: TAny) => selectorFor(k));
        const pks = () =>
            cachedArray(
                () => Array.from(index.getPksByKey(key.getValue())),
                on => {
                    let stopIndex = index.subscribeOnKey(key.getValue(), on);
                    const stopKey = key.subscribe(() => {
                        stopIndex();
                        stopIndex = index.subscribeOnKey(key.getValue(), on);
                        on();
                    });
                    return () => {
                        stopKey();
                        stopIndex();
                    };
                }
            );
        return Object.assign(entities, {
            pks,
            compact: () => compactedKeyed(key, (k: TAny) => selectorFor(k)),
            unsafeDense: () =>
                entities() as unknown as TExoBindable<readonly TEntity[]>,
            rows: <TSchema>(
                render: (e: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
            ) => rowsFrom(pks(), render),
            subscribe: (onChange: () => void) => entities().subscribe(onChange),
        });
    };

    const entities = (key: TAny) => entitiesFor(key);
    return Object.assign(entities, {
        pks: pksFor,
        compact: (key: TAny) => compacted(selectorFor(key)),
        unsafeDense: (key: TAny) =>
            entitiesFor(key) as unknown as TExoBindable<readonly TEntity[]>,
        rows: <TSchema>(
            key: TAny,
            render: (e: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
        ) => rowsFrom(pksFor(key), render),
        subscribe: (key: TAny, onChange: () => void) =>
            entitiesFor(key).subscribe(onChange),
        for: forKey,
        ...(isOrdered ? { list } : {}),
    });
}

/**
 * Entities of an index, in index order, WITHOUT holes.
 *
 * The underlying selectors are length-aligned with `undefined` where an entity is missing — a
 * defensive shape that only makes sense when the CALLER supplied the positions (that is `byPks`).
 * For an index read nothing depends on position, so the hole is pure friction: it stops the result
 * feeding `exoChildren<TEntity>` without narrowing, and pushed people into hand-rolled
 * read/subscribe glue. Compaction happens once per change and is cached behind the selector's own
 * signal, so repeated reads are O(1) and hand back the same array.
 *
 * KNOW WHAT THIS COSTS. A DERIVED index is dense — every pk in it came from an entity that exists —
 * so compaction removes nothing and the `| undefined` it erases was spurious. A MANUAL index
 * (`arrayBasedIndex`, `composite*Index`, anything written with `setPks`) can hold a pk whose entity
 * was never upserted or has since been removed, and compaction will drop it SILENTLY, shortening the
 * list. That inconsistency is an application bug, and hiding it is not this function's call to make:
 * on a manual index read through `aligned(key)`, where the hole shows up as `undefined` instead of
 * vanishing.
 */
function compacted<TEntity>(selector: TAny): TExoBindable<readonly TEntity[]> {
    return cachedArray<TEntity>(
        () => (selector.getValue() as (TEntity | undefined)[]).filter(isPresent),
        onChange => selector.watch(() => onChange())
    );
}

/** The same, for a selector that is rebuilt whenever a bindable key moves. */
function compactedKeyed<TEntity>(
    key: TOIMExodraReadable<TAny>,
    makeSelector: (key: TAny) => TAny
): TExoBindable<readonly TEntity[]> {
    const live = exoKeyed(key, makeSelector);
    return cachedArray<TEntity>(
        () => (live.getValue() as (TEntity | undefined)[]).filter(isPresent),
        onChange => live.subscribe(onChange)
    );
}

const isPresent = <TEntity>(entity: TEntity | undefined): entity is TEntity =>
    entity !== undefined;

/**
 * An array behind its source's own change signal: repeated reads are O(1) and hand back the SAME
 * array, so `rows` on top of it can short-circuit instead of re-deriving the key sequence. The cache
 * is trusted only while subscribed — with nothing listening there is no invalidation signal, so an
 * unsubscribed read goes to the index and stays correct (the SSR path).
 */
function cachedArray<TItem>(
    read: () => readonly TItem[],
    subscribe: (onChange: () => void) => () => void
): TExoBindable<readonly TItem[]> {
    let cached: readonly TItem[] | undefined;
    let subscribed = false;
    return exoSource(
        () => {
            if (subscribed && cached) return cached;
            const next = read();
            if (subscribed) cached = next;
            return next;
        },
        onChange => {
            subscribed = true;
            cached = undefined;
            const stop = subscribe(() => {
                cached = undefined;
                onChange();
            });
            return () => {
                subscribed = false;
                cached = undefined;
                stop();
            };
        }
    );
}
