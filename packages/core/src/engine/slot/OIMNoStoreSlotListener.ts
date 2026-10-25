import type { IOIMStoreSlotListener } from './interfaces/IOIMStoreSlotListener';

export class OIMNoStoreSlotListener implements IOIMStoreSlotListener {
    public static readonly INSTANCE = new OIMNoStoreSlotListener();

    public onStoreSlotCreated(): void {
        return;
    }
}
