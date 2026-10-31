import { OIMSlotContentSetBucketService } from '../OIMSlotContentSetBucketService';
import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TGroupSlot = TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentSetBucketService<TCardSlot>();
    const groupsService = createOIMSlotCollectionService({ slotContentService: membersService });
    const groups = groupsService.createStoreSlot(db);
    const rows = (from: number, count: number): TOIMEntitySlot<TCard, TOIMStoreKey>[] => {
        const made: TOIMEntitySlot<TCard, TOIMStoreKey>[] = [];
        for (let i = from; i < from + count; i++) {
            cardsService.writeSlotContentByKey(cards, `c${i}`, { id: `c${i}`, title: `C${i}` });
            made.push(cardsService.getSlotByKey(cards, `c${i}`));
        }
        db.flush();
        return made;
    };
    const ids = (bucket: TGroupSlot): string[] => {
        const out: string[] = [];
        for (const slot of Array.from(membersService.getBucketMemberSlots(bucket))) out.push(slot.entity?.id as string);
        return out.sort();
    };
    return { db, cardsService, cards, membersService, groupsService, groups, rows, ids };
};

describe('what a join and a leave cost against a whole re-declaration', () => {
    it('adds without naming what was already there, and wakes once', () => {
        const fixture = createFixture();
        const bucket = fixture.groupsService.holdSlotByKey(fixture.groups, 'g');
        const first = fixture.rows(0, 3);
        fixture.membersService.writeSlotContent(bucket, first);
        fixture.db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, () => { runCount++; }, [bucket]);
        const next = fixture.rows(3, 2);
        fixture.membersService.addBucketMemberSlots(bucket, next);
        fixture.db.flush();

        expect(fixture.ids(bucket)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
        expect(fixture.membersService.getBucketMemberSlotCount(bucket)).toBe(5);
        expect(runCount).toBe(1);
    });

    it('takes a hold per slot that joined, and only those', () => {
        const fixture = createFixture();
        const bucket = fixture.groupsService.holdSlotByKey(fixture.groups, 'g');
        const [a, b] = fixture.rows(0, 2);

        fixture.membersService.addBucketMemberSlots(bucket, [a, b]);
        const afterJoin = [a.holdCount, b.holdCount];
        fixture.membersService.addBucketMemberSlots(bucket, [a]);

        expect([a.holdCount, b.holdCount]).toEqual(afterJoin);
        expect(fixture.membersService.getBucketMemberSlotCount(bucket)).toBe(2);
    });

    it('gives the hold back for each slot that left, and wakes once', () => {
        const fixture = createFixture();
        const bucket = fixture.groupsService.holdSlotByKey(fixture.groups, 'g');
        const all = fixture.rows(0, 4);
        fixture.membersService.writeSlotContent(bucket, all);
        fixture.db.flush();
        const held = all[0].holdCount;

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, () => { runCount++; }, [bucket]);
        fixture.membersService.removeBucketMemberSlots(bucket, [all[0], all[1]]);
        fixture.db.flush();

        expect(fixture.ids(bucket)).toEqual(['c2', 'c3']);
        expect(all[0].holdCount).toBe(held - 1);
        expect(runCount).toBe(1);
    });

    it('tells nobody when nothing joined and nothing left', () => {
        const fixture = createFixture();
        const bucket = fixture.groupsService.holdSlotByKey(fixture.groups, 'g');
        const all = fixture.rows(0, 2);
        fixture.membersService.writeSlotContent(bucket, all);
        fixture.db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, () => { runCount++; }, [bucket]);
        fixture.membersService.addBucketMemberSlots(bucket, all);
        fixture.membersService.removeBucketMemberSlots(bucket, fixture.rows(5, 1));
        fixture.db.flush();

        expect(runCount).toBe(0);
    });

    it('leaves the standing slots untouched, where a re-declaration takes every hold again', () => {
        const fixture = createFixture();
        const addDoor = fixture.groupsService.holdSlotByKey(fixture.groups, 'add');
        const setDoor = fixture.groupsService.holdSlotByKey(fixture.groups, 'set');
        const standing = fixture.rows(0, 20);
        fixture.membersService.writeSlotContent(addDoor, standing);
        fixture.membersService.writeSlotContent(setDoor, standing);
        fixture.db.flush();
        const heldBefore = standing.map(slot => slot.holdCount);

        fixture.membersService.addBucketMemberSlots(addDoor, fixture.rows(20, 2));
        fixture.db.flush();

        expect(standing.map(slot => slot.holdCount)).toEqual(heldBefore);
        expect(fixture.membersService.getBucketMemberSlotCount(addDoor)).toBe(22);
    });
});
