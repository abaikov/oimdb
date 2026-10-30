import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSingleSourceTrackingComputedService } from '../createOIMSingleSourceTrackingComputedService';
import { createOIMSourceTrackingComputedService } from '../createOIMSourceTrackingComputedService';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';

type TCard = { id: string; title: string; isOn: boolean };

function setUp() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const write = (id: string, card: Partial<TCard>) => {
        cardsService.writeSlotContentByKey(cards, id, { id, title: id, isOn: false, ...card });
    };
    write('flag', { isOn: true });
    write('a', { title: 'A' });
    write('b', { title: 'B' });
    const flag = cardsService.holdSlotByKey(cards, 'flag');
    const a = cardsService.holdSlotByKey(cards, 'a');
    const b = cardsService.holdSlotByKey(cards, 'b');
    const titleService = createOIMSingleSourceTrackingComputedService<string>({
        derive: (_slot, sourceTracker) => sourceTracker.readSourceSlot(flag).entity?.isOn === true
            ? sourceTracker.readSourceSlot(a).entity?.title ?? ''
            : sourceTracker.readSourceSlot(b).entity?.title ?? '',
        initialValue: '',
    });
    const titleStoreSlot = titleService.createComputedStoreSlot(db);
    const title = titleService.computedSingleSlotService.holdSingleSlot(titleStoreSlot);
    db.flush();
    return { db, write, flag, a, b, title };
}

describe('what a source-tracking computed depends on', () => {
    it('derives from the sources it read and holds them, and only them', () => {
        const { title, flag, a, b } = setUp();

        expect(title.computedValueService.getValueForSlot(title)).toBe('A');
        expect(title.sourceSlots).toEqual([flag, a]);
        expect(flag.holdCount).toBe(2);
        expect(a.holdCount).toBe(2);
        expect(b.holdCount).toBe(1);
    });

    it('follows a switch of branch: holds the new source, lets the old one go, derives the new value', () => {
        const { db, write, title, flag, a, b } = setUp();
        title.computedValueService.getValueForSlot(title);

        write('flag', { isOn: false });
        db.flush();

        expect(title.computedValueService.getValueForSlot(title)).toBe('B');
        expect(title.sourceSlots).toEqual([flag, b]);
        expect(a.holdCount).toBe(1);
        expect(b.holdCount).toBe(2);
    });

    it('wakes a source-tracking effect on the source it switched to', () => {
        const { db, write, title } = setUp();
        const seen: string[] = [];
        const effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, sourceTracker => {
            seen.push(sourceTracker.readSourceComputedValue(title));
        });

        write('flag', { isOn: false });
        db.flush();
        write('b', { title: 'B2' });
        db.flush();
        write('a', { title: 'A2' });
        db.flush();

        expect(seen).toEqual(['A', 'B', 'B2']);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('re-subscribes the effect even when the switch leaves the value as it was', () => {
        const { db, write, title } = setUp();
        write('b', { title: 'A' });
        db.flush();
        const seen: string[] = [];
        const effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, sourceTracker => {
            seen.push(sourceTracker.readSourceComputedValue(title));
        });

        write('flag', { isOn: false });
        db.flush();
        expect(seen).toEqual(['A']);

        write('b', { title: 'B3' });
        db.flush();

        expect(seen).toEqual(['A', 'B3']);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('carries a switch through a source-tracking computed that reads it', () => {
        const { db, write, title } = setUp();
        const loudService = createOIMSingleSourceTrackingComputedService<string>({
            derive: (_slot, sourceTracker) => sourceTracker.readSourceComputedValue(title).toUpperCase(),
            initialValue: '',
        });
        const loud = loudService.computedSingleSlotService.holdSingleSlot(loudService.createComputedStoreSlot(db));
        const seen: string[] = [];
        const effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, sourceTracker => {
            seen.push(sourceTracker.readSourceComputedValue(loud));
        });

        write('b', { title: 'A' });
        db.flush();
        write('flag', { isOn: false });
        db.flush();
        write('b', { title: 'bee' });
        db.flush();

        expect(seen).toEqual(['A', 'BEE']);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('gives back every source hold when it is released', () => {
        const { title, flag, a, b } = setUp();
        title.computedValueService.getValueForSlot(title);

        title.owner.unholdSlot(title);

        expect([flag.holdCount, a.holdCount, b.holdCount]).toEqual([1, 1, 1]);
    });

    it('keys one tracker per slot, so two keys read different sources', () => {
        const { db, a, b } = setUp();
        const pickService = createOIMSourceTrackingComputedService<string, string>({
            derive: (slot, sourceTracker) => sourceTracker.readSourceSlot(slot.key === 'a' ? a : b).entity?.title ?? '',
            initialValue: '',
        });
        const picks = pickService.createComputedStoreSlot(db);
        const pickA = pickService.computedCollectionService.holdSlotByKey(picks, 'a');
        const pickB = pickService.computedCollectionService.holdSlotByKey(picks, 'b');

        expect([pickA.computedValueService.getValueForSlot(pickA), pickB.computedValueService.getValueForSlot(pickB)]).toEqual(['A', 'B']);
        expect(pickA.sourceSlots).toEqual([a]);
        expect(pickB.sourceSlots).toEqual([b]);
    });

    it('wakes a root-tracking effect, which declares the computed, on the source it switched to', () => {
        const { db, write, title } = setUp();
        const seen: string[] = [];
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => {
            seen.push(title.value);
        }, [], [], [title]);

        write('flag', { isOn: false });
        db.flush();
        write('b', { title: 'B2' });
        db.flush();
        expect(seen).toEqual(['B', 'B2']);

        write('a', { title: 'A2' });
        db.flush();
        expect(seen).toEqual(['B', 'B2']);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('re-subscribes a root-tracking effect when the switch leaves the value as it was', () => {
        const { db, write, title } = setUp();
        write('b', { title: 'A' });
        db.flush();
        const seen: string[] = [];
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => {
            seen.push(title.value);
        }, [], [], [title]);

        write('flag', { isOn: false });
        db.flush();
        write('b', { title: 'B3' });
        db.flush();

        expect(seen).toEqual(['B3']);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('cannot be handed to an effect or a computed that declares its sources', () => {
        const { db, title } = setUp();
        const declaredService = createOIMSingleComputedService<number>();

        // @ts-expect-error a source-tracking computed is read only through a source tracker
        OIMEffectService.INSTANCE.createEffect(db, () => undefined, [], [title]);
        // @ts-expect-error a source-tracking computed is read only through a source tracker
        declaredService.createComputedStoreSlot(db, () => 0, () => ({ sourceComputeds: [title] }));

        expect(title.sourceTracker).toBeDefined();
    });
});
