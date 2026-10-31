import type { IOIMSlotSubscriptionListener, OIMSlotContentEntityService, TOIMDisposer, TOIMEntityContentSlot, TOIMSlot } from '@oimdb/core';
import { OIMChannelService, oimIsSlotReleased } from '@oimdb/core';

export abstract class OIMBrowserSlotSubscriptionListener<TEntity extends object> implements IOIMSlotSubscriptionListener {
    private readonly slotContentEntityService: OIMSlotContentEntityService<TEntity>;

    private readonly browserListenerDisposersBySlot = new Map<TOIMSlot, TOIMDisposer>();

    public constructor(slotContentEntityService: OIMSlotContentEntityService<TEntity>) {
        this.slotContentEntityService = slotContentEntityService;
    }

    public onSlotFirstSubscribed(slot: TOIMSlot): void {
        const entitySlot = slot as TOIMEntityContentSlot<TEntity>;
        this.browserListenerDisposersBySlot.set(slot, this.listenToBrowser(() => { this.writeCurrentEntity(entitySlot); }));
        this.writeCurrentEntity(entitySlot);
    }

    public onSlotLastUnsubscribed(slot: TOIMSlot): void {
        const browserListenerDisposer = this.browserListenerDisposersBySlot.get(slot);
        if (browserListenerDisposer === undefined) return;
        this.browserListenerDisposersBySlot.delete(slot);
        browserListenerDisposer();
    }

    protected abstract readCurrentEntity(): TEntity;

    protected abstract listenToBrowser(onBrowserChanged: () => void): TOIMDisposer;

    private writeCurrentEntity(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        const channelSlot = entitySlot.storeSlot.channelSlot;
        if (!OIMChannelService.INSTANCE.isRefusingWrites(channelSlot)) {
            this.slotContentEntityService.writeSlotContent(entitySlot, this.readCurrentEntity());
            return;
        }
        const afterFlushDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFlush(channelSlot, () => {
            afterFlushDisposer();
            if (oimIsSlotReleased(entitySlot)) return;
            this.slotContentEntityService.writeSlotContent(entitySlot, this.readCurrentEntity());
        });
    }
}
