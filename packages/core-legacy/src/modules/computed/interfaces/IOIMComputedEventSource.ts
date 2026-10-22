import type { OIMEventEmitter } from '../../../core/OIMEventEmitter';
import type { EOIMComputedEventType } from '../enums/EOIMComputedEventType';
import type { TOIMComputedUpdatePayload } from '../types/TOIMComputedUpdatePayload';

type TOIMComputedKey = 'value';

export interface IOIMComputedEventSource {
    emitter: OIMEventEmitter<{
        [EOIMComputedEventType.UPDATE]: TOIMComputedUpdatePayload<TOIMComputedKey>;
    }>;
}


