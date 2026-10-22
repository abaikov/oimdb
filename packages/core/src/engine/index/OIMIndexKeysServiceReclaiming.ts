import { OIMIndexKeysService } from './OIMIndexKeysService';
import type { TOIMIndexKeysPositions } from './types/TOIMIndexKeysPositions';
import type { TOIMIndexableSlot } from '../slot/types/TOIMIndexableSlot';

export class OIMIndexKeysServiceReclaiming extends OIMIndexKeysService {
    public allocatePosition(positions: TOIMIndexKeysPositions): number {
        const freePosition = positions.freePositions.pop();
        return freePosition === undefined ? positions.nextPosition++ : freePosition;
    }

    public releasePosition(
        positions: TOIMIndexKeysPositions, position: number, slots: Iterable<TOIMIndexableSlot>,
    ): void {
        for (const slot of slots) {
            const indexKeys = slot.indexKeys;
            if (indexKeys !== undefined && position < indexKeys.length) indexKeys[position] = undefined;
        }
        positions.freePositions.push(position);
    }
}
