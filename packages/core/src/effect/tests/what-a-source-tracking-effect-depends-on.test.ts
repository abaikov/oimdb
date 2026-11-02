import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import type { OIMEntityContentService } from '../../entity/OIMEntityContentService';

type TLabel = { text: string };
type TSwitch = { isOn: boolean };
type TLabelService = ReturnType<typeof createOIMSingleSlotService<OIMEntityContentService<TLabel>>>;

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const firstService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TLabel>() });
    const first = firstService.createStoreSlot(db);
    firstService.writeSingleSlotContent(first, { text: 'dark' });
    const secondService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TLabel>() });
    const second = secondService.createStoreSlot(db);
    secondService.writeSingleSlotContent(second, { text: 'red' });
    const toggleService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TSwitch>() });
    const toggle = toggleService.createStoreSlot(db);
    toggleService.writeSingleSlotContent(toggle, { isOn: true });
    db.flush();
    return { db, effectService, first, firstService, second, secondService, toggle, toggleService };
};

const effectCountOf = (slot: TOIMSlot): number => slot.effects?.length ?? 0;

const writeText = (
    db: OIMDB,
    labelService: TLabelService,
    label: ReturnType<TLabelService['createStoreSlot']>,
    text: string,
): void => {
    labelService.slotContentService.updateEntity(labelService.getSingleSlot(label), { text });
    db.flush();
};

describe('what a source-tracking effect depends on', () => {
    it('wakes on a write to either of two slots it read', () => {
        const { db, effectService, first, firstService, second, secondService } = createFixture();
        const seen: string[] = [];
        effectService.createSourceTrackingEffect(db, () => {
            const firstText = firstService.getSingleSlot(first).entity?.text ?? '';
            const secondText = secondService.getSingleSlot(second).entity?.text ?? '';
            seen.push(`${firstText}/${secondText}`);
        });
        writeText(db, firstService, first, 'light');
        writeText(db, secondService, second, 'blue');
        expect(seen).toEqual(['dark/red', 'light/red', 'light/blue']);
    });

    it('hears only the branch it took, and moves when the branch flips', () => {
        const { db, effectService, first, firstService, second, secondService, toggle, toggleService } = createFixture();
        const seen: string[] = [];
        effectService.createSourceTrackingEffect(db, () => {
            const isOn = toggleService.getSingleSlot(toggle).entity?.isOn ?? false;
            const labelSlot = isOn ? firstService.getSingleSlot(first) : secondService.getSingleSlot(second);
            seen.push(labelSlot.entity?.text ?? '');
        });
        writeText(db, secondService, second, 'blue');
        expect(seen).toEqual(['dark']);
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second))]).toEqual([1, 0]);

        toggleService.slotContentService.updateEntity(toggleService.getSingleSlot(toggle), { isOn: false });
        db.flush();
        expect(seen).toEqual(['dark', 'blue']);
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second))]).toEqual([0, 1]);

        writeText(db, firstService, first, 'light');
        expect(seen).toEqual(['dark', 'blue']);
        writeText(db, secondService, second, 'green');
        expect(seen).toEqual(['dark', 'blue', 'green']);

        toggleService.slotContentService.updateEntity(toggleService.getSingleSlot(toggle), { isOn: true });
        db.flush();
        expect(seen).toEqual(['dark', 'blue', 'green', 'light']);
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second))]).toEqual([1, 0]);
    });

    it('subscribes once to a slot it read twice', () => {
        const { db, effectService, first, firstService } = createFixture();
        let runCount = 0;
        const effect = effectService.createSourceTrackingEffect(db, () => {
            void firstService.getSingleSlot(first).entity;
            void firstService.getSingleSlot(first).entity;
            runCount++;
        });
        expect(effectCountOf(firstService.getSingleSlot(first))).toBe(1);
        expect(effect.sourceSlots).toEqual([firstService.getSingleSlot(first)]);
        writeText(db, firstService, first, 'light');
        expect(runCount).toBe(2);
        expect(effectCountOf(firstService.getSingleSlot(first))).toBe(1);
    });

    it('wakes through a computed when its value moves, and not when it re-derives to the same value', () => {
        const { db, effectService, first, firstService } = createFixture();
        const textLengthService = createOIMSingleComputedService<number>();
        const textLength = textLengthService.createStoreSlot(
            db,
            () => firstService.getSingleSlot(first).entity?.text.length ?? 0,
            () => ({ sourceSlots: [firstService.getSingleSlot(first)] }),
        );
        const seen: number[] = [];
        effectService.createSourceTrackingEffect(db, () => {
            seen.push(textLengthService.getSingleSlot(textLength).value);
        });
        writeText(db, firstService, first, 'blue');
        expect(seen).toEqual([4]);
        writeText(db, firstService, first, 'light');
        expect(seen).toEqual([4, 5]);
    });

    it('takes every subscription off on dispose', () => {
        const { db, effectService, first, firstService, second, secondService } = createFixture();
        const textLengthService = createOIMSingleComputedService<number>();
        const textLength = textLengthService.createStoreSlot(
            db,
            () => secondService.getSingleSlot(second).entity?.text.length ?? 0,
            () => ({ sourceSlots: [secondService.getSingleSlot(second)] }),
        );
        const computedSlot = textLengthService.holdSingleSlot(textLength);
        let runCount = 0;
        const effect = effectService.createSourceTrackingEffect(db, () => {
            void firstService.getSingleSlot(first).entity;
            void computedSlot.value;
            runCount++;
        });
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second)), effectCountOf(computedSlot)]).toEqual([1, 1, 1]);
        effectService.disposeEffect(effect);
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second)), effectCountOf(computedSlot)]).toEqual([0, 0, 0]);
        writeText(db, firstService, first, 'light');
        writeText(db, secondService, second, 'green');
        expect(runCount).toBe(1);
        computedSlot.owner.unholdSlot(computedSlot);
    });

    it('leaves its subscriptions and its source list alone across runs that read the same slots', () => {
        const { db, effectService, first, firstService, second, secondService } = createFixture();
        let runCount = 0;
        const effect = effectService.createSourceTrackingEffect(db, () => {
            void firstService.getSingleSlot(first).entity;
            void secondService.getSingleSlot(second).entity;
            runCount++;
        });
        const sourceSlotsAfterFirstRun = effect.sourceSlots;
        const allRootSlotsAfterFirstRun = effect.allRootSlots;
        for (let i = 0; i < 5; i++) writeText(db, firstService, first, `text${i}`);
        expect(runCount).toBe(6);
        expect([effectCountOf(firstService.getSingleSlot(first)), effectCountOf(secondService.getSingleSlot(second))]).toEqual([1, 1]);
        expect(effect.sourceSlots === sourceSlotsAfterFirstRun).toBe(true);
        expect(effect.allRootSlots === allRootSlotsAfterFirstRun).toBe(true);
    });
});
