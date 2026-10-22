import type { IOIMStoreSlotListener } from './interfaces/IOIMStoreSlotListener';

export class OIMStoreSlotListenerNone implements IOIMStoreSlotListener {
    public static readonly INSTANCE = new OIMStoreSlotListenerNone();

    public onStoreSlotCreated(): void {
        return;
    }
}
