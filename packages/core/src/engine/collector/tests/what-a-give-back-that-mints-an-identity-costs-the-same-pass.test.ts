import { OIMSlotCollectionService } from '../../../facade/slot/OIMSlotCollectionService';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { OIMUnusedSlotCollectorService } from '../OIMUnusedSlotCollectorService';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import { createOIMPushColumnSlotOwner } from '../../column/utils/createOIMPushColumnSlotOwner';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import type { IOIMSlotContentService } from '../../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TToken = { id: TOIMStoreKey; value: string };
type TTokenSlot = TOIMEntitySlot<TToken, TOIMStoreKey>;
type TTokenStore = Map<TOIMStoreKey, TTokenSlot>;

class OIMTokenContentService implements IOIMSlotContentService<TTokenSlot>, IOIMKeyedSlotCreator<TOIMStoreKey, TTokenSlot> {
    public constructor(private readonly whenReleased: () => void) {}

    public createSlot(key: TOIMStoreKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TTokenSlot {
        return createOIMEntitySlot<TToken, TOIMStoreKey>(key, slotOwner, storeSlot);
    }

    public isSlotEmpty(slot: TTokenSlot): boolean {
        return slot.entity === undefined;
    }

    public hasReference(): boolean {
        return false;
    }

    public releaseSlotContent(slot: TTokenSlot): void {
        (slot as TOIMSlotEditable<TTokenSlot>).entity = undefined;
        this.whenReleased();
    }
}

class OIMTokenCollection {
    private readonly slotCollectionService: OIMSlotCollectionService<
        TOIMStoreKey, TTokenSlot, TTokenStore, OIMTokenContentService, string, TOIMColumnSlot, OIMPushColumnSlotOwner, TToken
    >;

    private readonly storeSlot: TOIMStoreSlot<TTokenStore, TTokenSlot, TToken>;

    public constructor(db: OIMDB, whenReleased: () => void) {
        this.slotCollectionService = new OIMSlotCollectionService({
            slotStoreService: new OIMSlotMapStoreService<TTokenSlot>(),
            slotContentService: new OIMTokenContentService(whenReleased),
            columnSlotOwnerOptions: { columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue() },
            createColumnSlotOwner: createOIMPushColumnSlotOwner,
        });
        this.storeSlot = this.slotCollectionService.createStoreSlot(db);
    }

    public get slotCount(): number { return this.slotCollectionService.getSlotCount(this.storeSlot); }

    public getSlotByKey(key: TOIMStoreKey): TTokenSlot { return this.slotCollectionService.getSlotByKey(this.storeSlot, key); }
}

const createFixture =() => {
    const db = new OIMDB();
    const unusedSlotCollectorSlot = db.collectorSlot.unusedSlotCollectorSlot;
    let lateSlot: TTokenSlot | undefined;
    let releasedLate = 0;
    let releasedGates = 0;
    const late = new OIMTokenCollection(db, () => { releasedLate++; });
    const gates = new OIMTokenCollection(db, () => {
        releasedGates++;
        lateSlot = late.getSlotByKey('late');
    });
    return {
        flushUnusedSlotCollector: (): void => { OIMUnusedSlotCollectorService.INSTANCE.flush(unusedSlotCollectorSlot); },
        late,
        gates,
        lateSlot: (): TTokenSlot | undefined => lateSlot,
        releasedLate: (): number => releasedLate,
        releasedGates: (): number => releasedGates,
    };
};

describe('an identity minted by the very give-back that is running', () => {
    it('is given back by that same pass, and is not left held until the next one', () => {
        const fixture = createFixture();
        const gate = fixture.gates.getSlotByKey('g1');
        expect(gate.holdCount).toBe(1);

        fixture.flushUnusedSlotCollector();

        const late = fixture.lateSlot();
        expect(late).toBeDefined();
        expect(late?.holdCount).toBe(0);
        expect(late !== undefined && oimIsSlotReleased(late)).toBe(true);
        expect(fixture.late.slotCount).toBe(0);
        expect(fixture.gates.slotCount).toBe(0);
        expect(oimIsSlotReleased(gate)).toBe(true);
    });

    it('is given back once, because the pass that gave it back kept nothing', () => {
        const fixture = createFixture();
        fixture.gates.getSlotByKey('g1');

        fixture.flushUnusedSlotCollector();
        fixture.flushUnusedSlotCollector();

        expect(fixture.releasedGates()).toBe(1);
        expect(fixture.releasedLate()).toBe(1);
    });
});
