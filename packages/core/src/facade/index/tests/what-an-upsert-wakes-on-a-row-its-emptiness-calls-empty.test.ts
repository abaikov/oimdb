import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import type { IOIMEntityWriter } from '../../../engine/entity/interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptiness } from '../../../engine/slot/interfaces/IOIMSlotEmptiness';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';

type TPost = { id: string; deleted?: boolean; title?: string; body?: string; deck?: string };
type TPostSlot = TOIMEntitySlot<TPost, TOIMStoreKey>;

const softDeleted: IOIMSlotEmptiness<TPostSlot> = {
    isEmpty: slot => slot.entity === undefined || slot.entity.deleted === true,
};

const nothingThere: IOIMSlotEmptiness<TPostSlot> = {
    isEmpty: slot => slot.entity === undefined,
};

const WRITERS: readonly [string, () => IOIMEntityWriter][] = [
    ['in place', () => createOIMEntityWriterInPlace()],
    ['replacing', () => createOIMEntityWriterReplacing()],
];

const openPosts = (entityWriter: IOIMEntityWriter, emptiness = softDeleted) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const postsService = createOIMEntityService<TPost, TOIMEntityColumnName<TPost>, TOIMStoreKey>(db, {
        keyOf: (post: TPost) => post.id,
        entityWriter,
        slotEmptiness: emptiness,
    });
    const posts = postsService.createStoreSlot(db);
    const upsertHeld = (post: TPost): TPostSlot => {
        postsService.slotContentService.upsertEntity(posts, post);
        return postsService.holdSlotByKey(posts, post.id);
    };
    const wakesOf = (slot: TPostSlot, names: readonly TOIMEntityColumnName<TPost>[]): Record<string, number> => {
        const wakes: Record<string, number> = { row: 0 };
        for (const name of names) {
            wakes[name] = 0;
            const columnSlot = postsService.holdColumn(slot, name);
            effectService.createEffect(db, [columnSlot], [], () => { wakes[name]++; });
        }
        effectService.createEffect(db, [slot], [], () => { wakes.row++; });
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

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false });
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

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false, title: 'a', body: 'same' });
        db.flush();

        expect(wakes.deleted).toBe(1);
        expect(wakes.body).toBe(0);
    });

    it('wakes a column that the revival brings in', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true });
        db.flush();
        const wakes = wakesOf(post, ['title']);

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false, title: 'new' });
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

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: true, title: 'a' }, changed);
        db.flush();

        expect(changed.length).toBe(0);
        expect(wakes).toEqual({ title: 0, deleted: 0, row: 0 });
    });

    it('reports a revival in the changed-slots list', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        db.flush();
        const changed: TPostSlot[] = [];

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false }, changed);

        expect(changed).toHaveLength(1);
        expect(changed[0] === post).toBe(true);
    });

    it('turns emptiness both ways on the same row', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const post = upsertHeld({ id: 'p1', deleted: true, title: 'a' });
        expect(oimIsSlotEmpty(post)).toBe(true);
        expect(postsService.hasSlotContentByKey(posts, 'p1')).toBe(false);

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false, title: 'a' });
        expect(oimIsSlotEmpty(post)).toBe(false);
        expect(postsService.hasSlotContentByKey(posts, 'p1')).toBe(true);

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: true, title: 'a' });
        expect(oimIsSlotEmpty(post)).toBe(true);
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

        postsService.slotContentService.upsertEntities(posts, [{ id: 'p1', deleted: false }, { id: 'p2', deleted: false }]);
        db.flush();

        expect(firstWakes.title).toBe(1);
        expect(secondWakes.title).toBe(1);
    });

    it('refiles the row in an index when the revival moves the key the index reads', () => {
        const { db, posts, postsService, upsertHeld } = openPosts(makeWriter());
        const byDeckService = createOIMIndexService<
            TPost, TOIMStoreKey, readonly TOIMEntityColumnName<TPost>[], string,
            Map<TOIMStoreKey, TPostSlot>, TOIMBucketSlotsSetStore<TOIMEntitySlot<TPost>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPost>>
        >(db, {
            entityService: postsService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPost>>(),
            keyOf: (post: TPost) => post.deck ?? 'none',
        });
        const byDeck = byDeckService.createIndexStoreSlot(posts);
        const a = byDeckService.holdSlotByKey(byDeck, 'a');
        const b = byDeckService.holdSlotByKey(byDeck, 'b');
        const post = upsertHeld({ id: 'p1', deleted: true, deck: 'a' });
        db.flush();
        expect(byDeckService.getEntitiesByKey(byDeck, 'a').map(entity => entity?.id)).toEqual(['p1']);

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', deleted: false, deck: 'b' });
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

        viaUpsert.postsService.slotContentService.upsertEntity(viaUpsert.posts, { id: 'p1', deleted: false, title: 'a', body: 'same' });
        viaUpdate.postsService.slotContentService.updateEntity(updated, { deleted: false });
        viaUpsert.db.flush();
        viaUpdate.db.flush();

        expect(upsertWakes).toEqual({ deleted: 1, body: 0, row: 1 });
        expect(upsertWakes).toEqual(updateWakes);
    });

    it('still fills a row that has nothing in it, waking every column the new row carries', () => {
        const { db, posts, postsService, upsertHeld, wakesOf } = openPosts(makeWriter(), nothingThere);
        const post = upsertHeld({ id: 'p1', title: 'a' });
        postsService.slotContentService.deleteEntity(post);
        db.flush();
        expect(post.entity).toBeUndefined();
        const wakes = wakesOf(post, ['id', 'title']);

        postsService.slotContentService.upsertEntity(posts, { id: 'p1', title: 'a' });
        db.flush();

        expect(post.entity).toEqual({ id: 'p1', title: 'a' });
        expect(wakes).toEqual({ id: 1, title: 1, row: 1 });
        post.owner.unholdSlot(post);
    });
});
