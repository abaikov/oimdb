import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveObject,
    OIMComputeRuntime,
    OIMComputed,
    OIMEffect,
    OIMEffectDependencyKeyedCollection,
    OIMEffectDependencyKeyedObject,
    OIMEffectDependencyComputed,
} from '@oimdb/core';

interface IProduct {
    id: string;
    price: number;
    qty: number;
}

function computedEffectsExample(): void {
    const queue = new OIMEventQueue({ scheduler: new OIMEventQueueSchedulerImmediate() });
    const runtime = new OIMComputeRuntime(queue);

    const products = new OIMReactiveCollection<IProduct, string>(queue, { selectPk: (p) => p.id });
    const settings = new OIMReactiveObject<'taxRate', number>(queue);

    products.upsertMany([
        { id: 'p1', price: 100, qty: 2 },
        { id: 'p2', price: 50,  qty: 5 },
    ]);
    settings.setProperty('taxRate', 0.2);
    queue.flush();

    // Derived: subtotal for p1 (recomputes when p1 changes)
    const p1Subtotal = new OIMComputed<number>(runtime, {
        compute: () => {
            const p = products.getOneByPk('p1');
            return p ? p.price * p.qty : 0;
        },
        deps: [new OIMEffectDependencyKeyedCollection(products, 'p1')],
    });

    // Derived: total with tax (recomputes when subtotal or taxRate changes)
    const total = new OIMComputed<number>(runtime, {
        compute: () => (1 + (settings.get('taxRate') ?? 0)) * p1Subtotal.get(),
        deps: [
            new OIMEffectDependencyComputed(p1Subtotal),
            new OIMEffectDependencyKeyedObject(settings, 'taxRate'),
        ],
    });

    // Side effect: logs whenever total changes
    const logEffect = new OIMEffect(runtime, {
        deps: [new OIMEffectDependencyComputed(total)],
        run: () => { console.log('Total with tax:', total.get()); },
    });
    queue.flush(); // initial run

    // Price change propagates: p1Subtotal -> total -> logEffect
    products.upsertOne({ id: 'p1', price: 120, qty: 2 });
    queue.flush();

    // Tax change propagates: total -> logEffect (skips p1Subtotal)
    settings.setProperty('taxRate', 0.25);
    queue.flush();

    logEffect.destroy();
    total.destroy();
    p1Subtotal.destroy();
    settings.destroy();
    products.destroy();
    queue.destroy();
    console.log('Done.');
}

if (require.main === module) {
    computedEffectsExample();
}

export { computedEffectsExample };
