import {
    OIMEventQueue,
    EOIMCollectionEventType,
    TOIMCollectionUpdatePayload,
    TOIMPk,
} from '@oimdb/core';
import { OIMCollectionAsync } from './OIMCollectionAsync';
import { TOIMCollectionOptionsAsync } from '../types/TOIMCollectionOptionsAsync';
import { OIMUpdateEventEmitterAsync } from './OIMUpdateEventEmitterAsync';

/**
 * Reactive async collection with event support.
 * Extends OIMCollectionAsync with reactive event system.
 */
export class OIMReactiveCollectionAsync<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMCollectionAsync<TEntity, TPk> {
    private readonly updateEmitter: OIMUpdateEventEmitterAsync<TPk>;
    private readonly unsubscribeFromCollectionUpdates: () => void;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionOptionsAsync<TEntity, TPk>
    ) {
        super(opts);
        this.updateEmitter = new OIMUpdateEventEmitterAsync<TPk>(queue);
        this.unsubscribeFromCollectionUpdates = this.emitter.on(
            EOIMCollectionEventType.UPDATE,
            this.onCollectionUpdate
        );
    }

    private readonly onCollectionUpdate = (
        payload: TOIMCollectionUpdatePayload<TPk>
    ) => {
        if (payload.pks.length === 0) {
            // Unknown keys changed (e.g. clear): notify all subscribed keys.
            this.updateEmitter.markAllUpdated();
            return;
        }
        this.updateEmitter.markUpdatedKeys(payload.pks);
    };

    public subscribeOnKey(
        pk: TPk,
        handler: () => void
    ): () => void {
        return this.updateEmitter.subscribeOnKey(pk, handler);
    }

    public subscribeOnKeys(
        pks: readonly TPk[],
        handler: () => void
    ): () => void {
        return this.updateEmitter.subscribeOnKeys(pks, handler);
    }

    public unsubscribeFromKey(pk: TPk, handler: () => void): void {
        this.updateEmitter.unsubscribeFromKey(pk, handler);
    }

    public unsubscribeFromKeys(pks: readonly TPk[], handler: () => void): void {
        this.updateEmitter.unsubscribeFromKeys(pks, handler);
    }

    public destroy(): void {
        this.unsubscribeFromCollectionUpdates();
        this.updateEmitter.destroy();
    }
}

