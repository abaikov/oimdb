import { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import { EOIMComputedEventType } from '../enum/EOIMComputedEventType';
import { TOIMComputedUpdatePayload } from '../types/TOIMComputedUpdatePayload';

type TOIMComputedKey = 'value';

export interface IOIMComputedEventSource {
    emitter: OIMEventEmitter<{
        [EOIMComputedEventType.UPDATE]: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>;
}


