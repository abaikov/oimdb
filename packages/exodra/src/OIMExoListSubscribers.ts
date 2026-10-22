import type { TExoListOp } from '@exodra/reactivity-types';
import type { TOIMDisposer } from '@oimdb/core';

type TOIMSubscription<TSchema> = {
    readonly update: (op: TExoListOp<TSchema>) => void;
    live: boolean;
};

export class OIMExoListSubscribers<TSchema> {
    private readonly subscriptions: TOIMSubscription<TSchema>[] = [];

    public add(update: (op: TExoListOp<TSchema>) => void): TOIMDisposer {
        const subscription: TOIMSubscription<TSchema> ={ update, live: true };
        this.subscriptions.push(subscription);
        return () => { this.delete(subscription); };
    }

    /** The ops of ONE frame, to everybody listening at the START of it — hence the snapshot. */
    public emit(ops: readonly TExoListOp<TSchema>[]): void {
        if (ops.length === 0) return;
        const round = this.subscriptions.slice();
        for (let i = 0; i < round.length; i++) {
            const subscription = round[i];
            for (let j = 0; j < ops.length && subscription.live; j++) subscription.update(ops[j]);
        }
    }

    public clear(): void {
        for (let i = 0; i < this.subscriptions.length; i++) this.subscriptions[i].live = false;
        this.subscriptions.length = 0;
    }

    private delete(subscription: TOIMSubscription<TSchema>): void {
        if (!subscription.live) return;
        subscription.live = false;
        const at = this.subscriptions.indexOf(subscription);
        if (at >= 0) this.subscriptions.splice(at, 1);
    }
}
