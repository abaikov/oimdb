import { OIMDB, OIMEffectService, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMSelectorSubscription } from '../src/OIMSelectorSubscription';

type TCard = { id: string; title: string };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
    cards.writeSlotContentByKey('k', { id: 'k', title: 'King' });
    db.flush();
    const selectorSubscription = new OIMSelectorSubscription(db);
    const selectAce = (): string | undefined => cards.getSlotByKey('a').entity?.title;
    const selectKing = (): string | undefined => cards.getSlotByKey('k').entity?.title;
    return { db, cards, selectorSubscription, selectAce, selectKing };
};

describe('what a render React threw away leaves in a selector subscription', () => {
    it('a subscription made after a thrown-away render subscribes to the committed select, and renders once more, since the select ran again', () => {
        const { db, cards, selectorSubscription, selectAce, selectKing } = build();
        const committed = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(committed.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        let changes = 0;
        const dispose = selectorSubscription.subscribe(() => { changes++; });
        dispose();
        selectorSubscription.renderSelector(selectKing);
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.subscribe(() => { changes++; });
        expect(selectorSubscription.getVersion()).toBe(versionBefore + 1);
        cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' });
        db.flush();
        expect(changes).toBe(0);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(changes).toBe(1);
    });

    it('a commit of a render whose tracking a thrown-away render overwrote tracks the committed select again', () => {
        const { db, cards, selectorSubscription, selectAce, selectKing } = build();
        let changes = 0;
        const first = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(first.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        selectorSubscription.subscribe(() => { changes++; });
        const moved = selectorSubscription.renderSelector(selectKing);
        selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(moved.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        expect(changes).toBe(1);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(changes).toBe(1);
        cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' });
        db.flush();
        expect(changes).toBe(2);
    });

    it('a select that threw leaves no tracking a subscription would trust', () => {
        const { db, cards, selectorSubscription, selectAce } = build();
        const committed = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(committed.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        expect(() => selectorSubscription.renderSelector(() => { cards.getSlotByKey('k').entity; throw new Error('boom'); })).toThrow('boom');
        let changes = 0;
        selectorSubscription.subscribe(() => { changes++; });
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(changes).toBe(1);
    });
});

describe('what a subscription that tracked the committed select again remembers', () => {
    it('compares the next render with the sources it subscribed to, not the ones the committed render read first', () => {
        const { db, cards, selectorSubscription, selectAce, selectKing } = build();
        let key = 'a';
        const selectByKey = (): string | undefined => cards.getSlotByKey(key).entity?.title;
        const committed = selectorSubscription.renderSelector(selectByKey);
        selectorSubscription.commitRender(committed.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        selectorSubscription.subscribe(() => undefined)();
        selectorSubscription.renderSelector(selectKing);
        key = 'k';
        let changes = 0;
        selectorSubscription.subscribe(() => { changes++; });
        const backOnAce = selectorSubscription.renderSelector(selectAce);
        expect(backOnAce.trackedSelectorRender).not.toBe(committed.trackedSelectorRender);
        selectorSubscription.commitRender(backOnAce.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        const notifiedByCommit = changes;
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(changes).toBe(notifiedByCommit + 1);
    });
});

describe('what a subscription asks of React after the render it subscribes for', () => {
    it('asks no render when nothing was written since that render', () => {
        const { selectorSubscription, selectAce } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.subscribe(() => undefined);
        expect(selectorSubscription.getVersion()).toBe(versionBefore);
    });

    it('asks a render when a slot nobody held was written since that render', () => {
        const { cards, selectorSubscription, selectAce } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        cards.writeSlotContentByKey('q', { id: 'q', title: 'Queen' });
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.subscribe(() => undefined);
        expect(selectorSubscription.getVersion()).toBe(versionBefore + 1);
    });

    it('asks a render when a slot the render read was written while held', () => {
        const { db, cards, selectorSubscription, selectAce } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        const holder = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [cards.getSlotByKey('a')]);
        const unheldSlotWriteCount = db.clock.unheldSlotWriteCount;
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        expect(db.clock.unheldSlotWriteCount).toBe(unheldSlotWriteCount);
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.subscribe(() => undefined);
        expect(selectorSubscription.getVersion()).toBe(versionBefore + 1);
        OIMEffectService.INSTANCE.disposeEffect(holder);
    });

    it('asks no render for a held write to a slot the render did not read', () => {
        const { db, cards, selectorSubscription, selectAce } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        const holder = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [cards.getSlotByKey('k')]);
        cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' });
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.subscribe(() => undefined);
        expect(selectorSubscription.getVersion()).toBe(versionBefore);
        OIMEffectService.INSTANCE.disposeEffect(holder);
    });

    it('asks a render on a key move when the new slot was written between render and commit', () => {
        const { cards, selectorSubscription, selectAce } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        let changes = 0;
        selectorSubscription.subscribe(() => { changes++; });
        const moved = selectorSubscription.renderSelector(() => cards.getSlotByKey('q').entity?.title);
        cards.writeSlotContentByKey('q', { id: 'q', title: 'Queen' });
        selectorSubscription.commitRender(moved.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        expect(changes).toBe(1);
    });
});

describe('what a commit over a slot released before it keeps as committed', () => {
    it('tracks the select again over a fresh slot, asks one render, settles, and subscribes again when the render moves back', () => {
        const { db, cards, selectorSubscription, selectAce } = build();
        const first = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(first.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        let changes = 0;
        selectorSubscription.subscribe(() => { changes++; });
        const moved = selectorSubscription.renderSelector(() => cards.getSlotByKey('x').entity?.title);
        db.flush();
        selectorSubscription.commitRender(moved.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        expect(changes).toBe(1);
        const movedAgain = selectorSubscription.renderSelector(() => cards.getSlotByKey('x').entity?.title);
        expect(movedAgain.trackedSelectorRender).toBe(moved.trackedSelectorRender);
        const backOnAce = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(backOnAce.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        const notifiedByCommit = changes;
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(changes).toBe(notifiedByCommit + 1);
    });
});

describe('what a thrown-away render leaves for the render after it', () => {
    it('a commit before the subscription that ran the committed select again asks one more render', () => {
        const { selectorSubscription, selectAce, selectKing } = build();
        const kept = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.renderSelector(selectKing);
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.commitRender(kept.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        selectorSubscription.subscribe(() => undefined);
        expect(selectorSubscription.getVersion()).toBe(versionBefore + 1);
    });

    it('notices a write to a committed slot before the flush, after a render that read other slots was thrown away', () => {
        const { cards, selectorSubscription, selectAce, selectKing } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        selectorSubscription.subscribe(() => undefined);
        const changeCountBefore = selectorSubscription.getCommittedSourceChangeCount();
        selectorSubscription.renderSelector(selectKing);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        expect(selectorSubscription.getCommittedSourceChangeCount()).toBe(changeCountBefore + 1);
        expect(selectorSubscription.getCommittedSourceChangeCount()).toBe(changeCountBefore + 1);
    });

    it('does not count a write to a slot only the thrown-away render read', () => {
        const { db, cards, selectorSubscription, selectAce, selectKing } = build();
        selectorSubscription.commitRender(selectorSubscription.renderSelector(selectAce).trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        selectorSubscription.subscribe(() => undefined);
        const changeCountBefore = selectorSubscription.getCommittedSourceChangeCount();
        selectorSubscription.renderSelector(selectKing);
        const holder = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [cards.getSlotByKey('k')]);
        cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' });
        expect(selectorSubscription.getCommittedSourceChangeCount()).toBe(changeCountBefore);
        OIMEffectService.INSTANCE.disposeEffect(holder);
    });
});

describe('what a commit of nothing new does', () => {
    it('does nothing for no render and for the render already committed', () => {
        const { selectorSubscription, selectAce } = build();
        const committed = selectorSubscription.renderSelector(selectAce);
        selectorSubscription.commitRender(committed.trackedSelectorRender);
        const versionBefore = selectorSubscription.getVersion();
        selectorSubscription.commitRender(undefined);
        selectorSubscription.commitRender(committed.trackedSelectorRender);
        selectorSubscription.notifyIfOwed();
        expect(selectorSubscription.getVersion()).toBe(versionBefore);
    });
});
