import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { OIMComputedValueService } from './OIMComputedValueService';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import type { TOIMIndexableSlot } from '../slot/types/TOIMIndexableSlot';
import type { TOIMComputedContentServiceOptions } from './types/TOIMComputedContentServiceOptions';
import { OIMComputedSourcesService } from './OIMComputedSourcesService';
import { createOIMComputedSlot } from './utils/createOIMComputedSlot';
import { createOIMComputedContentSlot } from './utils/createOIMComputedContentSlot';
import { assertOIMSlotUnheld } from '../slot/utils/assertOIMSlotUnheld';
import type { OIMSourceTracker } from './OIMSourceTracker';
import type { OIMComputedSlot } from './OIMComputedSlot';
import { peekOIMColumnGroupValue } from '../slot/utils/peekOIMColumnGroupValue';

export abstract class OIMComputedContentService<
    TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> = TOIMComputedContentSlot<TValue>,
>
implements IOIMSlotContentService<TComputedSlot>,
    IOIMKeyedSlotCreator<NonNullable<unknown>, TComputedSlot & TOIMIndexableSlot>, IOIMSingleSlotCreator<TComputedSlot> {
    private readonly computedValueService: OIMComputedValueService<TValue, TComputedSlot>;

    private readonly initialValue: TValue;

    protected constructor(options: TOIMComputedContentServiceOptions<TValue, TComputedSlot>) {
        this.computedValueService = options.computedValueService;
        this.initialValue = options.initialValue as TValue;
    }

    public createSlot<TKey extends NonNullable<unknown>>(
        key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner,
    ): TComputedSlot & TOIMIndexableSlot<TKey> {
        const computedSlot = createOIMComputedSlot<TValue, TKey>(
            key, slotOwner, this.computedValueService, this.initialValue, storeSlot, this.createSourceTracker(),
        ) as unknown as TComputedSlot & TOIMIndexableSlot<TKey>;
        return computedSlot;
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TComputedSlot {
        const computedSlot = createOIMComputedContentSlot<TValue>(
            slotOwner, this.computedValueService, this.initialValue, storeSlot, this.createSourceTracker(),
        ) as TComputedSlot;
        return computedSlot;
    }

    public isSlotEmpty(): boolean {
        return false;
    }

    public peekColumnValue(computedSlot: TComputedSlot, columnName: string): unknown {
        const value: unknown = (computedSlot as unknown as OIMComputedSlot<TValue>).content;
        return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[columnName] : undefined;
    }

    public peekColumnGroupValue(computedSlot: TComputedSlot, columnNames: readonly string[]): unknown {
        return peekOIMColumnGroupValue(this, computedSlot, columnNames);
    }

    public peekAnyColumnValue(computedSlot: TComputedSlot): unknown {
        return (computedSlot as unknown as OIMComputedSlot<TValue>).content;
    }

    public releaseSlotContent(computedSlot: TComputedSlot): void {
        assertOIMSlotUnheld(computedSlot);
        OIMComputedSourcesService.INSTANCE.unholdSources(computedSlot);
        this.computedValueService.releaseSlotValue(computedSlot);
    }

    protected createSourceTracker(): OIMSourceTracker | undefined {
        return undefined;
    }
}
