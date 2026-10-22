import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMIndexKeysPositions } from '../types/TOIMIndexKeysPositions';

export interface IOIMIndexKeysService {
    createPositions(): TOIMIndexKeysPositions;
    allocatePosition(positions: TOIMIndexKeysPositions): number;
    releasePosition(positions: TOIMIndexKeysPositions, position: number, slots: Iterable<TOIMIndexableSlot>): void;
    get<TIndexKey>(slot: TOIMIndexableSlot, position: number): TIndexKey | undefined;
    set<TIndexKey>(slot: TOIMIndexableSlot, position: number, indexKey: TIndexKey | undefined): void;
}
