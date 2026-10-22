import { OIMIndexKeysService } from './OIMIndexKeysService';
import type { TOIMIndexKeysPositions } from './types/TOIMIndexKeysPositions';

export class OIMIndexKeysServiceAppending extends OIMIndexKeysService {
    public static readonly INSTANCE = new OIMIndexKeysServiceAppending();

    public allocatePosition(positions: TOIMIndexKeysPositions): number {
        return positions.nextPosition++;
    }

    public releasePosition(): void {
        return;
    }
}
