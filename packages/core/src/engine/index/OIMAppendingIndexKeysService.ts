import { OIMIndexKeysService } from './OIMIndexKeysService';
import type { TOIMIndexKeysPositions } from './types/TOIMIndexKeysPositions';

export class OIMAppendingIndexKeysService extends OIMIndexKeysService {
    public static readonly INSTANCE = new OIMAppendingIndexKeysService();

    public allocatePosition(positions: TOIMIndexKeysPositions): number {
        return positions.nextPosition++;
    }

    public releasePosition(): void {
        return;
    }
}
