import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { createOIMInPlaceEntityWriter } from '../../entity/createOIMInPlaceEntityWriter';
import { createOIMReplacingEntityWriter } from '../../entity/createOIMReplacingEntityWriter';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { IOIMEntityWriter } from '../../entity/interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { isOIMSlotEmpty } from '../../slot/utils/isOIMSlotEmpty';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TPost = { id: string; deleted?: boolean; title?: string; body?: string; deck?: string };
type TPostSlot = TOIMEntitySlot<TPost, TOIMStoreKey>;

const softDeleted: IOIMSlotEmptinessPolicy<TPostSlot> = {
    isEmpty: slot => slot.entity === undefined || slot.entity.deleted === true,
};

const nothingThere: IOIMSlotEmptinessPolicy<TPostSlot> = {
    isEmpty: slot => slot.entity === undefined,
};

const WRITERS: readonly [string, () => IOIMEntityWriter][] = [
    ['in place', () => createOIMInPlaceEntityWriter()],
    ['replacing', () => createOIMReplacingEntityWriter()],
];

const openPosts = (entityWriter: IOIMEntityWriter, emptiness = softDeleted) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const postsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TPost, TOIMStoreKey>({ entityWriter, slotEmptinessPolicy: emptiness }) });
    const posts = postsService.createStoreSlot(db);
    const upsertHeld = (post: TPost): TPostSlot => {
        postsService.writeSlotContentByKey(posts, post.id, post);
        return postsService.holdSlotByKey(posts, post.id);
    };
    const wakesOf = (slot: TPostSlot, names: readonly TOIMColumnName<TPost>[]): Record<string, number> => {
        const wakes: Record<string, number> = { row: 0 };
        for (const name of names) {
            wakes[name] = 0;
            const columnSlot = postsService.columnSlotService.holdColumnSlot(slot, name);
            effectService.createEffect(db, () => { wakes[name]++; }, [columnSlot]);
        }
        effectService.createEffect(db, () => { wakes.row++; }, [slot]);
        return wakes;
    };
    return { db, posts, postsService, upsertHeld, wakesOf };
};

describe.each(WRITERS)('what an upsert wakes on a row its emptiness calls empty (%s)', (_, makeWriter) => {
    it('wakes a column that the revival takes away', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        db.flush();
        const wakes = wakesOf(post, ['title']);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false });
        db.flush();

        expect(post.entity).toEqual({ id: 'p1', deleted: false });
        expect(wakes.title).toBe(1);
        expect(wakes.row).toBe(1);
    });

    it('wakes the column that changed and leaves the one that did not', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a', body: 'same' });
        db.flush();
        const wakes = wakesOf(post, ['deleted', 'body']);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false, title: 'a', body: 'same' });
        db.flush();

        expect(wakes.deleted).toBe(1);
        expect(wakes.body).toBe(0);
    });

    it('wakes a column that the revival brings in', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true });
        db.flush();
        const wakes = wakesOf(post, ['title']);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false, title: 'new' });
        db.flush();

        expect(post.entity?.title).toBe('new');
        expect(wakes.title).toBe(1);
    });

    it('wakes nothing and reports nothing for an upsert that repeats the empty row exactly', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        db.flush();
        const wakes = wakesOf(post, ['title', 'deleted']);
        const changed: TPostSlot[] = [];

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: true, title: 'a' }, changed);
        db.flush();

        expect(changed.length).toBe(0);
        expect(wakes).toEqual({ title: 0, deleted: 0, row: 0 });
    });

    it('reports a revival in the changed-slots list', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        db.flush();
        const changed: TPostSlot[] = [];

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false }, changed);

        expect(changed).toHaveLength(1);
        expect(changed[0] === post).toBe(true);
    });

    it('turns emptiness both ways on the same row', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        expect(isOIMSlotEmpty(post)).toBe(true);
        expect(postsService.hasSlotContentByKey(posts, 'p1')).toBe(false);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false, title: 'a' });
        expect(isOIMSlotEmpty(post)).toBe(false);
        expect(postsService.hasSlotContentByKey(posts, 'p1')).toBe(true);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: true, title: 'a' });
        expect(isOIMSlotEmpty(post)).toBe(true);
        expect(postsService.hasSlotContentByKey(posts, 'p1')).toBe(false);
        db.flush();
        post.owner.unholdSlot(post);
    });

    it('wakes the taken column for every row of an upsertMany', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const first = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        const second = upsertHeld({ id: 'p2', deleted: true, title: 'b' });
        db.flush();
        const firstWakes = wakesOf(first, ['title']);
        const secondWakes = wakesOf(second, ['title']);

        postsService.writeInBatch(posts, () => ([{ id: 'p1', deleted: false }, { id: 'p2', deleted: false }]).map(entity => postsService.writeSlotContentByKey(posts, entity.id, entity)));
        db.flush();

        expect(firstWakes.title).toBe(1);
        expect(secondWakes.title).toBe(1);
    });

    it('refiles the row in an index when the revival moves the key the index reads', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const byDeckService = createOIMSlotCollectionIndexService<
            TPost, TOIMStoreKey, readonly TOIMColumnName<TPost>[], string,
            Map<TOIMStoreKey, TPostSlot>, TOIMBucketSlotsSetStore<TPostSlot>,
            OIMSetBucketContentService<TPostSlot, string>
        >({
            entityService: postsService,
            slotContentService: new OIMSetBucketContentService<TPostSlot, string>(),
            selectKey: (post: TPost) => post.deck ?? 'none',
        });
        const byDeck = byDeckService.createIndexStoreSlot(posts);
        const a = byDeckService.holdSlotByKey(byDeck, 'a');
        const b = byDeckService.holdSlotByKey(byDeck, 'b');
        const post = upsertHeld({ id: 'p1', deleted: true, deck: 'a' });
        db.flush();
        expect(byDeckService.getEntitiesByKey(byDeck, 'a').map(entity => entity?.id)).toEqual(['p1']);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', deleted: false, deck: 'b' });
        db.flush();

        expect(byDeckService.getEntitiesByKey(byDeck, 'a')).toEqual([]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'b').map(entity => entity?.id)).toEqual(['p1']);
        a.owner.unholdSlot(a);
        b.owner.unholdSlot(b);
        post.owner.unholdSlot(post);
    });

    it('agrees with update about what a revival wakes', () => {
        const viaUpsert = openPosts(makeWriter());
        const viaUpdate = openPosts(makeWriter());
        const upserted = viaUpsert.upsertHeld({ id: 'p1', deleted: true, title: 'a', body: 'same' });
        const updated = viaUpdate.upsertHeld({ id: 'p1', deleted: true, title: 'a', body: 'same' });
        viaUpsert.db.flush();
        viaUpdate.db.flush();
        const upsertWakes = viaUpsert.wakesOf(upserted, ['deleted', 'body']);
        const updateWakes = viaUpdate.wakesOf(updated, ['deleted', 'body']);

        viaUpsert.postsService.writeSlotContentByKey(viaUpsert.posts, 'p1', { id: 'p1', deleted: false, title: 'a', body: 'same' });
        viaUpdate.postsService.slotContentService.updateEntity(updated, { deleted: false });
        viaUpsert.db.flush();
        viaUpdate.db.flush();

        expect(upsertWakes).toEqual({ deleted: 1, body: 0, row: 1 });
        expect(upsertWakes).toEqual(updateWakes);
    });

    it('still fills a row that has nothing in it, waking every column the new row carries', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter(), nothingThere);
        const post = upsertHeld({ id: 'p1', title: 'a' });
        postsService.slotContentService.clearSlotContent(post);
        db.flush();
        expect(post.entity).toBeUndefined();
        const wakes = wakesOf(post, ['id', 'title']);

        postsService.writeSlotContentByKey(posts, 'p1', { id: 'p1', title: 'a' });
        db.flush();

        expect(post.entity).toEqual({ id: 'p1', title: 'a' });
        expect(wakes).toEqual({ id: 1, title: 1, row: 1 });
        post.owner.unholdSlot(post);
    });
});
