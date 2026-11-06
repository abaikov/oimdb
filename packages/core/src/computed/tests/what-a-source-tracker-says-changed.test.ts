import { OIMDB, OIMSourceTracker, createOIMEntitySlotCollectionStoreAggregate } from '../../index';

type TCard = { id: string; title: string };

describe('what a source tracker says changed', () => {
    it('says changed until the tracked sources are committed, and not for the same sources read again', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        cards.writeSlotContentByKey('k', { id: 'k', title: 'King' });
        const sourceTracker = new OIMSourceTracker();
        sourceTracker.runSourceTracking(() => cards.getSlotByKey('a').entity);
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(true);
        sourceTracker.runSourceTracking(() => cards.getSlotByKey('a').entity);
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(true);
        sourceTracker.commitTrackedSources();
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(false);
        sourceTracker.runSourceTracking(() => cards.getSlotByKey('a').entity);
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(false);
        sourceTracker.runSourceTracking(() => cards.getSlotByKey('k').entity);
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(true);
        sourceTracker.runSourceTracking(() => cards.getSlotByKey('a').entity);
        expect(sourceTracker.isTrackedSourcesChanged()).toBe(false);
    });
});
