import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import { OIMKeyTreeWalk } from './OIMKeyTreeWalk';

export class OIMScalarKeyTreeWalk extends OIMKeyTreeWalk<TOIMStoreKey | null | undefined> {
    public static readonly INSTANCE = new OIMScalarKeyTreeWalk();

    protected holdCompositeKeyPart(): void { return; }

    protected unholdCompositeKeyPart(): void { return; }
}
