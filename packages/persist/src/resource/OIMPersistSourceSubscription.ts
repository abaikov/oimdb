import type { TOIMDisposer } from '@oimdb/core';

export class OIMPersistSourceSubscription {
    private disposer: TOIMDisposer | undefined = undefined;

    public subscribeSource(subscribe: () => TOIMDisposer): void {
        if (this.disposer !== undefined) return;
        this.disposer = subscribe();
    }

    public unsubscribeSource(): void {
        const disposer = this.disposer;
        if (disposer === undefined) return;
        this.disposer = undefined;
        disposer();
    }
}
