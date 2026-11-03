import type { IOIMSlotSubscriptionListener, OIMEntityContentService, TOIMDisposer, TOIMEntityContentSlot, TOIMSlot } from '@oimdb/core';
import { OIMChannelService, isOIMSlotReleased } from '@oimdb/core';
import type { TOIMBrowserSlotSubscriptionListenerOptions } from './types/TOIMBrowserSlotSubscriptionListenerOptions';

export abstract class OIMBrowserSlotSubscriptionListener<TEntity extends object> implements IOIMSlotSubscriptionListener {
    private readonly entityContentService: OIMEntityContentService<TEntity>;

    private readonly onBrowserEntityWritten: (() => void) | undefined;

    private readonly browserListenerDisposersBySlot = new Map<TOIMSlot, TOIMDisposer>();

    public constructor(browserSlotSubscriptionListenerOptions: TOIMBrowserSlotSubscriptionListenerOptions<TEntity>) {
        this.entityContentService = browserSlotSubscriptionListenerOptions.entityContentService;
        this.onBrowserEntityWritten = browserSlotSubscriptionListenerOptions.onBrowserEntityWritten;
    }

    public onSlotFirstSubscribed(slot: TOIMSlot): void {
        const entitySlot = slot as TOIMEntityContentSlot<TEntity>;
        this.browserListenerDisposersBySlot.set(slot, this.listenToBrowser(() => { this.writeCurrentEntity(entitySlot, this.onBrowserEntityWritten); }));
        this.writeCurrentEntity(entitySlot, undefined);
    }

    public onSlotLastUnsubscribed(slot: TOIMSlot): void {
        const browserListenerDisposer = this.browserListenerDisposersBySlot.get(slot);
        if (browserListenerDisposer === undefined) return;
        this.browserListenerDisposersBySlot.delete(slot);
        browserListenerDisposer();
    }

    protected abstract readCurrentEntity(): TEntity;

    protected abstract listenToBrowser(onBrowserChanged: () => void): TOIMDisposer;

    private writeCurrentEntity(entitySlot: TOIMEntityContentSlot<TEntity>, onBrowserEntityWritten: (() => void) | undefined): void {
        const channelSlot = entitySlot.storeSlot.channelSlot;
        if (!OIMChannelService.INSTANCE.isRefusingWrites(channelSlot)) {
            this.entityContentService.writeSlotContent(entitySlot, this.readCurrentEntity());
            onBrowserEntityWritten?.();
            return;
        }
        const afterFlushDisposer = OIMChannelService.INSTANCE.subscribeAfterEachFlush(channelSlot, () => {
            afterFlushDisposer();
            if (isOIMSlotReleased(entitySlot)) return;
            this.entityContentService.writeSlotContent(entitySlot, this.readCurrentEntity());
            onBrowserEntityWritten?.();
        });
    }
}
