import type { TOIMDisposer } from '@oimdb/core';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import type { TOIMPersistSourceChangeMarkSubscriptionDrivenOptions } from './types/TOIMPersistSourceChangeMarkSubscriptionDrivenOptions';

export class OIMPersistSourceChangeMarkSubscriptionDriven implements IOIMPersistSourceChangeMark {
    private readonly disposer: TOIMDisposer;
    private isSourceChanged = false;

    public constructor(
        persistSourceChangeMarkSubscriptionDrivenOptions: TOIMPersistSourceChangeMarkSubscriptionDrivenOptions,
    ) {
        this.disposer = persistSourceChangeMarkSubscriptionDrivenOptions.subscribeSourceChanged(() => {
            this.isSourceChanged = true;
        });
    }

    public isSourceChangedSinceMark(): boolean {
        return this.isSourceChanged;
    }

    public dispose(): void {
        this.disposer();
    }
}
