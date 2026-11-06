import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { OIMDB, createOIMComputedService, createOIMEntitySlotCollectionStoreAggregate, isOIMSlotReleased } from '@oimdb/core';
import { OIMDBProvider, useOIMComputedValueByKey, useOIMSelector } from '../src/index';

type TCard = { id: string; title: string };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
    db.flush();
    const releasedSlot = cards.getSlotByKey('x');
    db.flush();
    return { db, cards, releasedSlot };
};

describe('a selector over a slot captured outside it and released', () => {
    it('is released before the test reads it', () => {
        expect(isOIMSlotReleased(build().releasedSlot)).toBe(true);
    });

    it('mounts with one render more, and still hears the live slots it read', () => {
        const { db, cards, releasedSlot } = build();
        let renders = 0;
        function Card(): React.ReactElement {
            renders++;
            const text = useOIMSelector(() => `${releasedSlot.entity?.title ?? '-'} ${cards.getSlotByKey('a').entity?.title ?? '-'}`);
            return <span data-testid="card">{text}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        expect(renders).toBe(2);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('- Ace of spades');
        expect(renders).toBe(3);
    });

    it('moves onto it with one render more, and does not render again by itself', () => {
        const { db, cards, releasedSlot } = build();
        let renders = 0;
        function Card({ isReleasedRead }: { isReleasedRead: boolean }): React.ReactElement {
            renders++;
            const text = useOIMSelector(() => {
                const ace = cards.getSlotByKey('a').entity?.title ?? '-';
                return isReleasedRead ? `${releasedSlot.entity?.title ?? '-'} ${ace}` : ace;
            }, [isReleasedRead]);
            return <span data-testid="card">{text}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card isReleasedRead={false} /></OIMDBProvider>);
        const mountedRenders = renders;
        rerender(<OIMDBProvider db={db}><Card isReleasedRead /></OIMDBProvider>);
        expect(renders).toBe(mountedRenders + 2);
        expect(screen.getByTestId('card').textContent).toBe('- Ace');
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('- Ace of spades');
        expect(renders).toBe(mountedRenders + 3);
    });

    it('subscribes to a computed it read beside the released slot', () => {
        const { db, cards, releasedSlot } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Card(): React.ReactElement {
            const text = useOIMSelector(() => `${releasedSlot.entity?.title ?? '-'} ${louds.getSlotByKey('a').value}`);
            return <span data-testid="card">{text}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('- ACE OF SPADES');
    });

    it.each(['x', 'a'])('recovers a computed by key %s that a flush released between render and subscribe', (key) => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); }, []);
            return <span />;
        }
        function Loud(): React.ReactElement {
            return <span data-testid="loud">{useOIMComputedValueByKey(louds, key)}</span>;
        }
        render(<OIMDBProvider db={db}><Loud /><Flusher /></OIMDBProvider>);
        act(() => { cards.writeSlotContentByKey(key, { id: key, title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toBe('TEN');
    });

    it('costs no render more on a later commit over the released slot', () => {
        const { db, cards, releasedSlot } = build();
        let renders = 0;
        function Card({ id }: { id: string }): React.ReactElement {
            renders++;
            return <span>{useOIMSelector(() => `${releasedSlot.entity?.title ?? '-'} ${cards.getSlotByKey(id).entity?.title ?? '-'}`, [id])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="a" /></OIMDBProvider>);
        const mountedRenders = renders;
        rerender(<OIMDBProvider db={db}><Card id="k" /></OIMDBProvider>);
        expect(renders).toBe(mountedRenders + 1);
    });

    it('settles when a layout effect before its commit flushes on every commit', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        let renders = 0;
        function Loud({ id }: { id: string }): React.ReactElement {
            renders++;
            React.useLayoutEffect(() => { db.flush(); });
            return <span data-testid="loud">{useOIMComputedValueByKey(louds, id)}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Loud id="x" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Loud id="y" /></OIMDBProvider>);
        expect(renders).toBe(3);
        act(() => { cards.writeSlotContentByKey('y', { id: 'y', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toBe('TEN');
    });

    it('costs no render more when a commit meets a second released slot', () => {
        const { db, cards, releasedSlot } = build();
        const otherReleasedSlot = cards.getSlotByKey('z');
        db.flush();
        let renders = 0;
        function Card({ isOtherRead }: { isOtherRead: boolean }): React.ReactElement {
            renders++;
            return <span>{useOIMSelector(() => `${releasedSlot.entity?.title ?? '-'} ${isOtherRead ? otherReleasedSlot.entity?.title ?? '-' : ''}`, [isOtherRead])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card isOtherRead={false} /></OIMDBProvider>);
        const mountedRenders = renders;
        rerender(<OIMDBProvider db={db}><Card isOtherRead /></OIMDBProvider>);
        expect(renders).toBe(mountedRenders + 1);
    });

    it('settles when the slot is taken in the component body and a layout effect flushes on every commit', () => {
        const { db, cards } = build();
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); });
            return <span />;
        }
        function Card({ id }: { id: string }): React.ReactElement {
            const slot = cards.getSlotByKey(id);
            return <><Flusher /><span data-testid="card">{useOIMSelector(() => slot.entity?.title ?? '-', [slot])}</span></>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="x" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Card id="y" /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('-');
        act(() => { cards.writeSlotContentByKey('y', { id: 'y', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ten');
    });

    it('recovers a computed taken in the component body that one flush released before the subscription', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); }, []);
            return <span />;
        }
        function Loud(): React.ReactElement {
            const loud = louds.getSlotByKey('x');
            return <span data-testid="loud">{useOIMSelector(() => loud.value, [loud])}</span>;
        }
        render(<OIMDBProvider db={db}><Loud /><Flusher /></OIMDBProvider>);
        act(() => { cards.writeSlotContentByKey('x', { id: 'x', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toBe('TEN');
    });

    it('costs one render more on a commit that meets the released slot again after one that did not', () => {
        const { db, releasedSlot } = build();
        let renders = 0;
        function Card({ isReleasedRead }: { isReleasedRead: boolean }): React.ReactElement {
            renders++;
            return <span>{useOIMSelector(() => (isReleasedRead ? releasedSlot.entity?.title ?? '-' : '+'), [isReleasedRead])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card isReleasedRead /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Card isReleasedRead={false} /></OIMDBProvider>);
        const beforeRenders = renders;
        rerender(<OIMDBProvider db={db}><Card isReleasedRead /></OIMDBProvider>);
        expect(renders).toBe(beforeRenders + 2);
    });

    it('settles when a computed taken in the component body is released by a flush on every commit', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        let renders = 0;
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); });
            return <span />;
        }
        function Loud(): React.ReactElement {
            renders++;
            const loud = louds.getSlotByKey('x');
            return <><Flusher /><span data-testid="loud">{useOIMSelector(() => loud.value, [loud])}</span></>;
        }
        render(<OIMDBProvider db={db}><Loud /></OIMDBProvider>);
        expect(renders).toBe(2);
        act(() => { cards.writeSlotContentByKey('x', { id: 'x', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toBe('TEN');
    });

    it('recovers an entity slot taken in the component body that one flush released before the subscription', () => {
        const { db, cards } = build();
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); }, []);
            return <span />;
        }
        function Card(): React.ReactElement {
            const slot = cards.getSlotByKey('x');
            return <span data-testid="card">{useOIMSelector(() => slot.entity?.title ?? '-', [slot])}</span>;
        }
        render(<OIMDBProvider db={db}><Card /><Flusher /></OIMDBProvider>);
        act(() => { cards.writeSlotContentByKey('x', { id: 'x', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ten');
    });

    it('still hears the live slots it read after a computed taken in the body throws on every commit', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); });
            return <span />;
        }
        function Loud(): React.ReactElement {
            const loud = louds.getSlotByKey('x');
            return <><Flusher /><span data-testid="loud">{useOIMSelector(() => `${loud.value} ${cards.getSlotByKey('a').entity?.title ?? '-'}`, [loud])}</span></>;
        }
        render(<OIMDBProvider db={db}><Loud /></OIMDBProvider>);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toContain('Ace of spades');
    });

    it('still hears the live root of a computed by key a that a flush released', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Flusher(): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); });
            return <span />;
        }
        function Loud(): React.ReactElement {
            const loud = louds.getSlotByKey('a');
            return <><Flusher /><span data-testid="loud">{useOIMSelector(() => loud.value, [loud])}</span></>;
        }
        render(<OIMDBProvider db={db}><Loud /></OIMDBProvider>);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toBe('ACE OF SPADES');
    });

    it('recovers a key that a flush released before the commit, beside a slot captured outside select', () => {
        const { db, cards, releasedSlot } = build();
        function Flusher({ id }: { id: string }): React.ReactElement {
            React.useLayoutEffect(() => { db.flush(); }, [id]);
            return <span />;
        }
        function Card({ id }: { id: string }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => `${releasedSlot.entity?.title ?? '-'} ${cards.getSlotByKey(id).entity?.title ?? '-'}`, [id])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Flusher id="a" /><Card id="a" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Flusher id="q" /><Card id="q" /></OIMDBProvider>);
        act(() => { cards.writeSlotContentByKey('q', { id: 'q', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('- Ten');
    });

    it('keeps holding a live computed beside one a flush released', () => {
        const { db, cards } = build();
        const loudService = createOIMComputedService<string, string>({
            createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '-').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
        function Flusher({ id }: { id: string }): React.ReactElement {
            React.useLayoutEffect(() => { if (id !== 'a') db.flush(); }, [id]);
            return <span />;
        }
        function Loud({ id }: { id: string }): React.ReactElement {
            const kept = React.useMemo(() => louds.getSlotByKey('a'), []);
            const moved = louds.getSlotByKey(id);
            return <><Flusher id={id} /><span data-testid="loud">{useOIMSelector(() => `${kept.value} ${moved.value}`, [kept, moved])}</span></>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Loud id="a" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Loud id="x" /></OIMDBProvider>);
        act(() => { db.flush(); });
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('loud').textContent).toContain('ACE OF SPADES');
    });

    it('settles when a child flushes in its render, before every commit of the slot taken in the body', () => {
        const { db, cards } = build();
        let renders = 0;
        function RenderFlusher(): React.ReactElement {
            db.flush();
            return <span />;
        }
        function Card({ id }: { id: string }): React.ReactElement {
            renders++;
            const slot = cards.getSlotByKey(id);
            return <><span data-testid="card">{useOIMSelector(() => slot.entity?.title ?? '-', [slot])}</span><RenderFlusher /></>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="x" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Card id="y" /></OIMDBProvider>);
        expect(renders).toBe(3);
        expect(screen.getByTestId('card').textContent).toBe('-');
    });
});
