import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import { OIMKeyTreeWalk } from './OIMKeyTreeWalk';

export class OIMKeyTreeWalkScalar extends OIMKeyTreeWalk<TOIMStoreKey> {
    public static readonly INSTANCE = new OIMKeyTreeWalkScalar();

    protected holdCompositeKeyPart(): void { return; }

    protected unholdCompositeKeyPart(): void { return; }
}
