import { EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts, wireExoNode } from '@exodra/core';
import { ExoDomBackend, withExoCompiler } from '@exodra/dom';
import type { TExoDomNode } from '@exodra/dom';
import {
    OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import type { TOIMBucketContentSlot, TOIMBucketSlotsArrayStore, TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin } from '../src/OIMExodraPlugin';
import { withOIMBucketChildren } from '../src/withOIMBucketChildren';
import { withOIMEffects } from '../src/withOIMEffects';

type TTodo = { id: string; title: string; done: boolean };
type TTodoSlot = TOIMEntitySlot<TTodo, string>;
type TTodosBucketSlot = TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TTodoSlot>, TTodoSlot>;

describe('what two bucket children on one node show', () => {
    it('shows each bucket in its own port, and a wire restarts only the port whose bucket changed', () => {
        const db = new OIMDB();
        const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
        const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
            selectKey: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
            slotContentService: new OIMPositionalArrayBucketContentService<TTodoSlot, string>({ bucketCommands: new OIMBucketCommands({}) }),
        });
        const exodraPlugin = new OIMExodraPlugin({ db });
        const TodoPorts = exoPorts({ TITLE: EXO_PORT_TEXT });
        const todoMachine = withOIMEffects(
            createExoMachine<TExoDomNode, TTodoSlot, { slot: TTodoSlot }>(
                createExoSchema(TodoPorts, (b) => { b.el('li', null, (li) => { li.textPort(TodoPorts.TITLE); }); }),
                { createInitialState: (_c, slot) => ({ slot }) },
            ),
            (effect) => { effect((c) => { c.text(TodoPorts.TITLE, c.state.slot.entity?.title ?? ''); }); },
        );
        const ColumnsPorts = exoPorts({ LEFT: EXO_PORT_CHILDREN, RIGHT: EXO_PORT_CHILDREN });
        type TColumnsParams = { readonly left: TTodosBucketSlot; readonly right: TTodosBucketSlot };
        const columnsMachine = withOIMBucketChildren(
            withOIMBucketChildren(
                createExoMachine<TExoDomNode, TColumnsParams, Record<string, never>>(
                    createExoSchema(ColumnsPorts, (b) => {
                        b.el('div', null, (div) => {
                            div.el('ul', { class: 'left' }, (ul) => { ul.childrenPort(ColumnsPorts.LEFT); });
                            div.el('ul', { class: 'right' }, (ul) => { ul.childrenPort(ColumnsPorts.RIGHT); });
                        });
                    }),
                    {},
                ),
                { childrenPort: ColumnsPorts.LEFT, memberMachine: todoMachine, selectBucketSlot: (params) => params.left },
            ),
            { childrenPort: ColumnsPorts.RIGHT, memberMachine: todoMachine, selectBucketSlot: (params) => params.right },
        );
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        todos.writeSlotContentByKey('2', { id: '2', title: 'Test', done: true });
        db.flush();
        const root = document.createElement('div');
        document.body.appendChild(root);
        const backend = composeExoPlugins(withExoCompiler(new ExoDomBackend()), { exodraPlugin: () => exodraPlugin });
        const columns = backend.createExoNode(columnsMachine as never);
        wireExoNode(columns, { left: todosByDone.getSlotByKey('active'), right: todosByDone.getSlotByKey('done') });
        backend.mountRoot(columns, root);
        const titlesIn = (selector: string): string[] => Array.from(root.querySelectorAll(`${selector} li`)).map((li) => li.textContent ?? '');
        expect(titlesIn('.left')).toEqual(['Write']);
        expect(titlesIn('.right')).toEqual(['Test']);
        const keptLeft = root.querySelector('.left li');
        const watch = jest.spyOn(todosByDone.getSlotByKey('active'), 'watch');

        wireExoNode(columns, { left: todosByDone.getSlotByKey('active'), right: todosByDone.getSlotByKey('active') });

        expect(titlesIn('.right')).toEqual(['Write']);
        expect(root.querySelector('.left li')).toBe(keptLeft);
        expect(watch).toHaveBeenCalledTimes(1);
    });
});
