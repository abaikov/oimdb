import type { IOIMIndexKeysService } from './interfaces/IOIMIndexKeysService';
import type { TOIMIndexKeysPositions } from './types/TOIMIndexKeysPositions';
import type { TOIMIndexableSlot } from '../slot/types/TOIMIndexableSlot';
import type { TOIMSlotEditable } from '../slot/types/TOIMSlotEditable';

export abstract class OIMIndexKeysService implements IOIMIndexKeysService {
    public createPositions(): TOIMIndexKeysPositions {
        return { nextPosition: 0, freePositions: [] };
    }

    public abstract allocatePosition(positions: TOIMIndexKeysPositions): number;

    public abstract releasePosition(
        positions: TOIMIndexKeysPositions, position: number, slots: Iterable<TOIMIndexableSlot>,
    ): void;

    public get<TIndexKey>(slot: TOIMIndexableSlot, position: number): TIndexKey | undefined {
        const indexKeys = slot.indexKeys;
        return indexKeys === undefined || position >= indexKeys.length
            ? undefined
            : indexKeys[position] as TIndexKey | undefined;
    }

    public set<TIndexKey>(slot: TOIMIndexableSlot, position: number, indexKey: TIndexKey | undefined): void {
        const indexKeys = slot.indexKeys;
        if (indexKeys !== undefined) {
            if (position < indexKeys.length) {
                indexKeys[position] = indexKey;
                return;
            }
            if (indexKey === undefined) return;
            while (indexKeys.length < position) indexKeys.push(undefined);
            indexKeys.push(indexKey);
            return;
        }
        if (indexKey === undefined) return;
        const created: unknown[] = [];
        while (created.length < position) created.push(undefined);
        created.push(indexKey);
        (slot as TOIMSlotEditable<TOIMIndexableSlot>).indexKeys = created;
    }
}
