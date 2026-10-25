import type { IOIMSlotSubscriptionListener } from './interfaces/IOIMSlotSubscriptionListener';

export class OIMNoSlotSubscriptionListener implements IOIMSlotSubscriptionListener {
    public static readonly INSTANCE = new OIMNoSlotSubscriptionListener();

    public onSlotFirstSubscribed(): void {
        return;
    }

    public onSlotLastUnsubscribed(): void {
        return;
    }
}
