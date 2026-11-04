import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { OIMSourceTracker } from '../../computed/OIMSourceTracker';
import { createOIMEntitySlotCollectionStoreAggregate } from '../../entity/createOIMEntitySlotCollectionStoreAggregate';
import { createOIMColumnGroup } from '../../column/utils/createOIMColumnGroup';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';

type TCard = { id: string; title: string; rank: number };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace', rank: 1 });
    cards.writeSlotContentByKey('k', { id: 'k', title: 'King', rank: 13 });
    db.flush();
    let runs = 0;
    const effect = OIMEffectService.INSTANCE.createEffectOverSourceTracker(db, new OIMSourceTracker(), () => { runs++; });
    return { db, cards, effect, runs: () => runs };
};

describe('what an effect over a source tracker subscribes to', () => {
    it('subscribes to what another tracker read, and runs its body without reading anything again', () => {
        const { db, cards, effect, runs } = build();
        let reads = 0;
        const readTracker = new OIMSourceTracker();
        const title = readTracker.runSourceTracking(() => { reads++; return cards.getSlotByKey('a').entity?.title; });
        OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, readTracker);

        cards.getSlotByKey('a').updateEntity({ rank: 2 });
        db.flush();

        expect(title).toBe('Ace');
        expect(runs()).toBe(1);
        expect(reads).toBe(1);
    });

    it('moves to the sources of the next tracker and stops hearing the ones it left', () => {
        const { db, cards, effect, runs } = build();
        const aceTracker = new OIMSourceTracker();
        aceTracker.runSourceTracking(() => cards.getSlotByKey('a').entity);
        OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, aceTracker);
        const kingTracker = new OIMSourceTracker();
        kingTracker.runSourceTracking(() => cards.getSlotByKey('k').entity);
        expect(OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, kingTracker)).toBe(true);
        const sameKingTracker = new OIMSourceTracker();
        sameKingTracker.runSourceTracking(() => cards.getSlotByKey('k').entity);
        expect(OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, sameKingTracker)).toBe(false);

        cards.getSlotByKey('a').updateEntity({ rank: 2 });
        db.flush();
        expect(runs()).toBe(0);
        cards.getSlotByKey('k').updateEntity({ rank: 12 });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('keeps the column group it was handed, so a sibling column does not wake it', () => {
        const { db, cards, effect, runs } = build();
        const titleGroup = createOIMColumnGroup(['title']);
        const readTracker = new OIMSourceTracker();
        readTracker.runSourceTracking(() => cards.getSlotByKey('a').getEntity(titleGroup)?.title);
        OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, readTracker);

        cards.getSlotByKey('a').updateEntity({ rank: 2 });
        db.flush();
        expect(runs()).toBe(0);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(runs()).toBe(1);
    });

    it('holds what it subscribed to until it is disposed', () => {
        const { db, cards, effect } = build();
        const readTracker = new OIMSourceTracker();
        const queen = readTracker.runSourceTracking(() => cards.getSlotByKey('q'));
        void readTracker.runSourceTracking(() => queen.entity);
        OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, readTracker);
        db.flush();
        expect(isOIMSlotReleased(queen)).toBe(false);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        db.flush();
        expect(isOIMSlotReleased(queen)).toBe(true);
    });

    it('refuses an effect that has no source tracker of its own', () => {
        const { db } = build();
        const plainEffect = OIMEffectService.INSTANCE.createEffect(db, () => undefined);
        expect(() => OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(plainEffect, new OIMSourceTracker()))
            .toThrow('was not created over a source tracker');
    });
});
