import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMDerivedCollectionIndexArrayBased } from '../src/core/OIMDerivedCollectionIndexArrayBased';
import { OIMOrderedListCommandStreamDiffDriven } from '../src/modules/wrapper/index/OIMOrderedListCommandStreamDiffDriven';
import { createOIMOrderedListMappedCommandStream } from '../src/modules/wrapper/index/createOIMOrderedListMappedCommandStream';
import { TOIMOrderedListCommand } from '../src/modules/wrapper/index/TOIMOrderedListCommand';
import { TOIMEntitySlot } from '../src/types/TOIMEntitySlot';

type Card = { id: string; deckId?: string; title: string; position: number };
type Slot = TOIMEntitySlot<Card, string>;

function setup(threshold?: number) {
    const queue = new OIMEventQueue();
    const cards = new OIMReactiveCollection<Card, string>(queue, {
        selectPk: c => c.id,
    });
    cards.upsertMany([
        { id: 'c1', deckId: 'deck1', title: 'One', position: 2 },
        { id: 'c2', deckId: 'deck1', title: 'Two', position: 1 },
    ]);
    const index = new OIMDerivedCollectionIndexArrayBased<string, string, Card>(
        queue,
        cards,
        { selectIndexKeys: c => c.deckId, orderBy: c => c.position }
    );
    const stream = new OIMOrderedListCommandStreamDiffDriven<
        string,
        string,
        Card
    >(
        queue,
        index,
        threshold === undefined ? undefined : { resetThreshold: threshold }
    );

    const batches: TOIMOrderedListCommand<Slot>[][] = [];
    stream.subscribeCommands('deck1', () => {
        const cmds = stream.consumeCommands('deck1');
        if (cmds.length > 0) batches.push(cmds);
    });

    const pks = () => stream.getItemsByKey('deck1').map(s => s.pk);
    return { queue, cards, index, stream, batches, pks };
}

describe('OIMOrderedListCommandStreamDiffDriven', () => {
    test('initial order is readable; sorted by orderBy', () => {
        const { pks } = setup();
        expect(pks()).toEqual(['c2', 'c1']); // position 1, 2
    });

    test('reordering a card emits a move, not a reset', () => {
        const { queue, cards, batches, pks } = setup();

        cards.upsertOne({ id: 'c1', deckId: 'deck1', title: 'One', position: 0 });
        queue.flush(); // c1 now sorts before c2

        expect(pks()).toEqual(['c1', 'c2']);
        const cmds = batches.flat();
        expect(cmds.some(c => c.type === 'move')).toBe(true);
        expect(cmds.some(c => c.type === 'reset')).toBe(false);
    });

    test('adding a card in the middle emits an insert', () => {
        const { queue, cards, batches, pks } = setup();

        cards.upsertOne({
            id: 'c3',
            deckId: 'deck1',
            title: 'Mid',
            position: 1.5,
        });
        queue.flush();

        expect(pks()).toEqual(['c2', 'c3', 'c1']);
        const insert = batches.flat().find(c => c.type === 'insert');
        expect(insert).toBeDefined();
        expect((insert as { item: Slot }).item.pk).toBe('c3');
    });

    test('removing a card (leaves the deck) emits a remove', () => {
        const { queue, cards, batches, pks } = setup();

        cards.upsertOne({
            id: 'c2',
            deckId: undefined,
            title: 'Two',
            position: 1,
        }); // leaves deck1 (merge keeps old fields, so clear deckId explicitly)
        queue.flush();

        expect(pks()).toEqual(['c1']);
        expect(batches.flat().some(c => c.type === 'remove')).toBe(true);
    });

    test('a change that does not affect order emits nothing', () => {
        const { queue, cards, batches } = setup();

        // title is not the orderBy key; order stays ['c2','c1']
        cards.upsertOne({
            id: 'c1',
            deckId: 'deck1',
            title: 'One renamed',
            position: 2,
        });
        queue.flush();

        expect(batches).toEqual([]);
    });

    test('resetThreshold falls back to a reset when most of the bucket changed', () => {
        const { queue, cards, batches, pks } = setup(0.5);

        // Replace both cards with two brand-new ones → 0 common pks.
        cards.upsertOne({ id: 'c1', deckId: undefined, title: 'gone', position: 2 });
        cards.upsertOne({ id: 'c2', deckId: undefined, title: 'gone', position: 1 });
        cards.upsertMany([
            { id: 'c9', deckId: 'deck1', title: 'New', position: 1 },
            { id: 'c8', deckId: 'deck1', title: 'New2', position: 2 },
        ]);
        queue.flush();

        expect(pks()).toEqual(['c9', 'c8']);
        expect(batches.flat().some(c => c.type === 'reset')).toBe(true);
    });

    test('composes with createOIMOrderedListMappedCommandStream (move keeps node)', () => {
        const { queue, cards, index } = setup();
        const diff = new OIMOrderedListCommandStreamDiffDriven<
            string,
            string,
            Card
        >(queue, index);

        let n = 0;
        const nodeByPk = new Map<string, number>();
        const mapped = createOIMOrderedListMappedCommandStream(
            diff,
            (slot: Slot) => {
                const node = n++;
                nodeByPk.set(slot.pk, node);
                return node;
            }
        );

        // wire + initial
        expect(mapped.getItemsByKey('deck1')).toEqual([
            nodeByPk.get('c2'),
            nodeByPk.get('c1'),
        ]);
        const c1NodeBefore = nodeByPk.get('c1');

        const applied: number[] = mapped.getItemsByKey('deck1').slice();
        mapped.subscribeCommands('deck1', () => {
            for (const cmd of mapped.consumeCommands('deck1')) {
                if (cmd.type === 'move') {
                    const seg = applied.splice(cmd.from, cmd.count ?? 1);
                    applied.splice(cmd.to, 0, ...seg);
                }
            }
        });

        cards.upsertOne({ id: 'c1', deckId: 'deck1', title: 'One', position: 0 });
        queue.flush();

        // c1's node was moved, not recreated.
        expect(nodeByPk.get('c1')).toBe(c1NodeBefore);
        expect(applied).toEqual([nodeByPk.get('c1'), nodeByPk.get('c2')]);
    });
});
