import type { TExoBindable, TExoBindableList } from '@exodra/reactivity-types';
import {
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMReactiveIndexSetBased,
    createOIMOrderedListCommandStreamDiffDriven,
} from '@oimdb/core';
import type {
    IOIMOrderedListCommandSource,
    TOIMCollectionKit,
    TOIMEntitySlot,
    TOIMKey,
} from '@oimdb/core';
import type { TOIMExodraCollection } from './types/TOIMExodraCollection';
import type { TOIMExodraKeyArg } from './types/TOIMExodraIndexFacade';
import { exoBindable } from './exoBindable';
import { exoChildren } from './exoChildren';
import { exoList } from './exoList';

/* eslint-disable @typescript-eslint/no-explicit-any -- see note below */
/*
 * Index kinds are dispatched at RUNTIME by `instanceof` against four distinct base classes, while the
 * public types resolve the same fork statically (`TOIMExodraIndexFacade`). TypeScript cannot follow a
 * value across that fork, so the bodies below are written against loose shapes and the exported
 * signature — which is what every caller sees — carries the precision. The `any`s are confined to
 * this dispatch table and never reach the API surface.
 */
type TAnyIndex = any;

/**
 * Turn an OIMDB collection kit into its Exodra-side view: the exoskeleton over the collection.
 *
 * ```ts
 * const users = exoCollection(usersKit, { byTeam, byTeamOrdered, online });
 *
 * users.byPk('u1')                          // TExoBindable<User | undefined>
 * users.byTeam(selectedTeam)                // entities for a key — set/array/composite/global,
 * users.byTeamOrdered.rows(team, render)    //   the kind is inferred from the index itself
 * users.byTeamOrdered.list(team, render)    // O(delta), ordered indexes only
 * ```
 *
 * Every index you name becomes ONE callable member carrying everything you can do with it, so the
 * caller never picks a method to match the index kind and never passes the index object again.
 * Keys accept a bindable, so a view follows a moving selection without being rebuilt.
 *
 * `indexes` is a separate argument because a kit does not own its indexes — `kit.indexFactory`
 * creates them and the app keeps them. Should core ever let a kit hold named indexes, this argument
 * becomes optional without breaking anything here.
 */
export function exoCollection<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndexes extends Record<string, unknown> = Record<string, never>,
>(
    kit: TOIMCollectionKit<TEntity, TPk>,
    indexes?: TIndexes
): TOIMExodraCollection<TEntity, TPk, TIndexes> {
    const select = kit.select;

    const byPk = (pk: TOIMExodraKeyArg<TPk>): TExoBindable<TEntity | undefined> =>
        exoBindable(pk, (k: TPk) => select.byPk(k));

    const facade: Record<string, unknown> = {
        kit,
        byPk,
        byPks: (pks: TOIMExodraKeyArg<readonly TPk[]>) =>
            exoBindable(pks, (k: readonly TPk[]) => select.byPks(k)),
    };

    for (const [name, index] of Object.entries(indexes ?? {})) {
        facade[name] = createIndexFacade(kit, byPk, index as TAnyIndex);
    }

    return facade as TOIMExodraCollection<TEntity, TPk, TIndexes>;
}

function createIndexFacade<TEntity extends object, TPk extends TOIMKey>(
    kit: TOIMCollectionKit<TEntity, TPk>,
    byPk: (pk: TOIMExodraKeyArg<TPk>) => TExoBindable<TEntity | undefined>,
    index: TAnyIndex
): TAnyIndex {
    const select = kit.select as TAnyIndex;
    const isOrdered = index instanceof OIMReactiveIndexArrayBased;
    const isKeyedSet = index instanceof OIMReactiveIndexSetBased;
    const isGlobal =
        index instanceof OIMReactiveGlobalIndexArrayBased ||
        index instanceof OIMReactiveGlobalIndexSetBased;

    if (!isOrdered && !isKeyedSet && !isGlobal) {
        throw new Error(
            'exoCollection: not a reactive index. Pass instances created by `kit.indexFactory.*` ' +
                '(derivedSetIndex / derivedArrayIndex / composite* / *GlobalIndex).'
        );
    }

    // Composite indexes ARE set/array indexes whose key is a path, so the selector to use is chosen
    // per call from the key's shape rather than from the index's class.
    const entitiesSelector = (key: TAnyIndex) => {
        if (isGlobal) {
            return index instanceof OIMReactiveGlobalIndexArrayBased
                ? select.entitiesByArrayGlobalIndex(index)
                : select.entitiesBySetGlobalIndex(index);
        }
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

    const entities = (key?: TAnyIndex) =>
        isGlobal
            ? exoBindable(entitiesSelector(undefined))
            : exoBindable(key, (k: TAnyIndex) => entitiesSelector(k));

    const readPks = (key?: TAnyIndex): readonly TPk[] =>
        isGlobal
            ? Array.from(index.getPks())
            : Array.from(index.getPksByKey(key));

    const subscribeToIndex = (key: TAnyIndex, onChange: () => void) =>
        isGlobal
            ? index.subscribe(onChange)
            : index.subscribeOnKey(key, onChange);

    /*
     * Membership is cached behind the index's own change signal, so repeated reads are O(1) and hand
     * back the SAME array — without it every `getValue()` copied the whole set, and `rows` on top of
     * it then re-derived the key sequence, making a no-op read O(n) twice over.
     * The cache is only trusted while subscribed: with nothing listening there is no invalidation
     * signal, so an unsubscribed read goes to the index and stays correct (the SSR path).
     */
    const pks = (key?: TAnyIndex): TExoBindable<readonly TPk[]> => {
        let cached: readonly TPk[] | undefined;
        let subscribed = false;
        return exoBindable(
            () => {
                if (subscribed && cached) return cached;
                const next = readPks(key);
                if (subscribed) cached = next;
                return next;
            },
            onChange => {
                subscribed = true;
                cached = undefined;
                const stop = subscribeToIndex(key, () => {
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
    };

    const rows = <TSchema>(
        keyOrRender: TAnyIndex,
        maybeRender?: (
            entity: TExoBindable<TEntity | undefined>,
            pk: TPk
        ) => TSchema
    ): TExoBindable<readonly TSchema[]> => {
        const render = (maybeRender ?? keyOrRender) as (
            entity: TExoBindable<TEntity | undefined>,
            pk: TPk
        ) => TSchema;
        const key = maybeRender ? keyOrRender : undefined;
        return exoChildren(pks(key), {
            key: (pk: TPk) => pk,
            render: (pk: TPk) => render(byPk(pk), pk),
        });
    };

    // One stream per ordered index, shared by every key — it buffers per key internally.
    let stream: IOIMOrderedListCommandSource<TOIMKey, TOIMEntitySlot<TEntity, TPk>> | undefined;
    const list = <TSchema>(
        key: TOIMKey,
        render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
    ): TExoBindableList<TSchema> => {
        // Narrowed by `isOrdered` above; the union here is an artefact of the loose dispatch type.
        stream ??= createOIMOrderedListCommandStreamDiffDriven(
            kit.queue,
            index as TAnyIndex
        );
        return exoList(stream as TAnyIndex, key, (slot: TAnyIndex) =>
            render(byPk(slot.pk as TPk), slot.pk as TPk)
        );
    };

    const call = isGlobal
        ? () => entities()
        : (key: TAnyIndex) => entities(key);

    return Object.assign(call, {
        pks,
        rows,
        // `subscribe(onChange)` on a global index, `subscribe(key, onChange)` on a keyed one.
        subscribe: (keyOrHandler: TAnyIndex, maybeHandler?: () => void) => {
            const onChange = (maybeHandler ?? keyOrHandler) as () => void;
            const key = maybeHandler ? keyOrHandler : undefined;
            // The bindable already swallows the emit its selector fires while subscribing, so the
            // handler sees genuine changes only — no guard needed here.
            return entities(key).subscribe(onChange);
        },
        ...(isOrdered ? { list } : {}),
    });
}
