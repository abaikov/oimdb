import type { IOIMEffectService } from '../interfaces/IOIMEffectService';
import type { TOIMDerivation } from './TOIMDerivation';
import type { TOIMEffectBody } from './TOIMEffectBody';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';

export type TOIMEffect = TOIMDerivation & {
    readonly effectService: IOIMEffectService;
    readonly channelSlot: TOIMChannelSlot;
    readonly allRootSlots: readonly TOIMSlot[];
    positionInFirstSubscribedSlot: number;
    positionsInOtherSubscribedSlots: number[] | undefined;
    effectFlags: number;
    readonly body: TOIMEffectBody;
    cleanup: (() => void) | undefined;
};
