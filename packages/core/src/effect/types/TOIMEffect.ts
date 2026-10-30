import type { IOIMEffectService } from '../interfaces/IOIMEffectService';
import type { TOIMComputedDerivation } from '../../computed/types/TOIMComputedDerivation';
import type { TOIMEffectBody } from './TOIMEffectBody';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';
import type { OIMSourceTracker } from '../../computed/OIMSourceTracker';

export type TOIMEffect = TOIMComputedDerivation & {
    readonly effectService: IOIMEffectService;
    readonly channelSlot: TOIMChannelSlot;
    readonly allRootSlots: readonly TOIMSlot[];
    positionInFirstSubscribedSlot: number;
    positionsInOtherSubscribedSlots: number[] | undefined;
    effectFlags: number;
    readonly body: TOIMEffectBody;
    cleanup: (() => void) | undefined;
    readonly sourceTracker: OIMSourceTracker | undefined;
};
