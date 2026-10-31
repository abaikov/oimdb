import type { IOIMEntityWriter } from '../entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../slot/interfaces/IOIMStoreSlotListener';
import type { TOIMEntityContentSlot } from '../entity/types/TOIMEntityContentSlot';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMDefaultsOptions } from './types/TOIMDefaultsOptions';

export class OIMDefaults {
    public static readonly INSTANCE = new OIMDefaults();

    public readonly slotStamp: IOIMSlotStamp<TOIMSlot> | undefined;

    public readonly slotReleasePolicy: IOIMSlotReleasePolicy | undefined;

    public readonly entityWriter: IOIMEntityWriter | undefined;

    public readonly entitySlotEmptinessPolicy: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot> | undefined;

    public readonly indexKeysService: IOIMIndexKeysService | undefined;

    public readonly columnSlotStoreService: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;

    public readonly computedColumnSlotStoreService: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;

    public readonly storeSlotListener: IOIMStoreSlotListener | undefined;

    public constructor(options: TOIMDefaultsOptions = {}) {
        this.slotStamp = options.slotStamp;
        this.slotReleasePolicy = options.slotReleasePolicy;
        this.entityWriter = options.entityWriter;
        this.entitySlotEmptinessPolicy = options.entitySlotEmptinessPolicy;
        this.indexKeysService = options.indexKeysService;
        this.columnSlotStoreService = options.columnSlotStoreService;
        this.computedColumnSlotStoreService = options.computedColumnSlotStoreService;
        this.storeSlotListener = options.storeSlotListener;
    }
}
