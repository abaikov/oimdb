import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { IOIMComputedValueService } from '../computed/interfaces/IOIMComputedValueService';
import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../computed/OIMSourceTracker';
import type { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../computed/constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';

export class OIMColumnSlot extends OIMSlot {
    public computedValueService: IOIMComputedValueService;

    public key: string;

    public sourceSlots: readonly TOIMSlot[];

    public sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[];

    public content: unknown;

    public ranAtRevision: number;

    public ranAtEpoch: number;

    public checkedAtRevision: number;

    public checkedAtEpoch: number;

    public isDeriving: boolean;

    public rootSlots: readonly TOIMSlot[] | undefined;

    public sourceTracker: OIMSourceTracker | undefined;

    public carrierSlot: TOIMSlot;

    public constructor(
        key: string, owner: IOIMSlotOwner & IOIMComputedValueService, carrierSlot: TOIMSlot,
        sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[], sourceTracker: OIMSourceTracker | undefined,
    ) {
        super(owner, carrierSlot.storeSlot);
        this.computedValueService = owner;
        this.key = key;
        this.sourceSlots = OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
        this.sourceComputeds = sourceComputeds;
        this.content = undefined;
        this.ranAtRevision = -1;
        this.ranAtEpoch = -1;
        this.checkedAtRevision = -1;
        this.checkedAtEpoch = -1;
        this.isDeriving = false;
        this.rootSlots = undefined;
        this.sourceTracker = sourceTracker;
        this.carrierSlot = carrierSlot;
        this.changedAtRevision = carrierSlot.changedAtRevision;
        this.changedAtEpoch = carrierSlot.changedAtEpoch;
    }

    public get value(): unknown {
        const value = this.computedValueService.getValueForSlot(this);
        (this.owner as OIMColumnSlotOwner<TOIMSlot, TOIMKeyedSlot<string>>).trackSourceColumnSlot(this);
        return value;
    }
}
