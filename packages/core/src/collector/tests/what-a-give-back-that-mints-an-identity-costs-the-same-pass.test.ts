import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { OIMUnusedSlotCollectorService } from '../OIMUnusedSlotCollectorService';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import { createOIMPushColumnSlotOwner } from '../../column/utils/createOIMPushColumnSlotOwner';
import { OIMDB } from '../../db/OIMDB';
import { OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE } from '../../db/constants/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE';

import type { IOIMSlotContentService } from '../../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../../slot/interfaces/IOIMKeyedSlotCreator';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { entitySlotOf } from '../../../tests/support/entitySlotOf';

type TToken = { id: TOIMStoreKey; value: string };
type TTokenSlot = TOIMEntitySlot<TToken, TOIMStoreKey>;
type TTokenStore = Map<TOIMStoreKey, TTokenSlot>;

class OIMTokenContentService implements IOIMSlotContentService<TTokenSlot>, IOIMKeyedSlotCreator<TOIMStoreKey, TTokenSlot> {
    public constructor(private readonly whenReleased: () => void) {}

    public createSlot(key: TOIMStoreKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TTokenSlot {
        return createOIMEntitySlot<TToken, TOIMStoreKey>(key, slotOwner, storeSlot);
    }

    public isSlotEmpty(slot: TTokenSlot): boolean {
        return (slot as unknown as { content: unknown }).content === undefined;
    }

    public peekColumnValue(): unknown {
        return undefined;
    }

    public peekColumnGroupValue(): unknown {
        return undefined;
    }

    public peekAnyColumnValue(): unknown {
        return undefined;
    }

    public releaseSlotContent(slot: TTokenSlot): void {
        entitySlotOf(slot).content = undefined;
        this.whenReleased();
    }
}

class TokenSlotCollectionService extends OIMSlotCollectionService<
    TOIMStoreKey, TTokenSlot, TTokenStore, OIMTokenContentService, string, TOIMColumnSlot, OIMPushColumnSlotOwner, TToken
> {
    public createStoreSlot(db: OIMDB): TOIMStoreSlot<TTokenStore, TTokenSlot, TToken, this> {
        return this.createStoreSlotOnChannel(db.defaultChannelSlot);
    }
}

class OIMTokenCollection {
    private readonly slotCollectionService: TokenSlotCollectionService;

    private readonly storeSlot: TOIMStoreSlot<TTokenStore, TTokenSlot, TToken>;

    public constructor(db: OIMDB, whenReleased: () => void) {
        this.slotCollectionService = new TokenSlotCollectionService({
            slotStoreService: new OIMSlotMapStoreService<TTokenSlot>(),
            slotContentService: new OIMTokenContentService(whenReleased),
            columnSlotOwnerOptions: { columnSlotStoreService: OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.getValue() },
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
        expect(late !== undefined && isOIMSlotReleased(late)).toBe(true);
        expect(fixture.late.slotCount).toBe(0);
        expect(fixture.gates.slotCount).toBe(0);
        expect(isOIMSlotReleased(gate)).toBe(true);
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
