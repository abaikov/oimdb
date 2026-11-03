import {
    EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts,
} from '@exodra/core';
import { ExoDomBackend, withExoChildList, withExoCompiler } from '@exodra/dom';
import type { TExoChildList, TExoDomNode } from '@exodra/dom';
import {
    OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService, createOIMEntityContentService,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin } from '../../src/OIMExodraPlugin';
import { withOIMBucketList } from '../../src/withOIMBucketList';
import { withOIMEffects } from '../../src/withOIMEffects';

export type TTodo = { id: string; title: string; done: boolean };
type TTodoSlot = TOIMEntitySlot<TTodo, string>;

export function createTodoFixture() {
    const db = new OIMDB();
    const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
    const todosByDoneContentService = new OIMPositionalArrayBucketContentService<TTodoSlot, string>({ bucketCommands: new OIMBucketCommands({}) });
    const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
        keyOf: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
        slotContentService: todosByDoneContentService,
    });
    const filter = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ shown: 'done' | 'active' }>() });
    filter.writeSingleSlotContent({ shown: 'active' });
    const exodraPlugin = new OIMExodraPlugin({ db });

    const TodoPorts = exoPorts({ TITLE: EXO_PORT_TEXT });
    const todoSchema = createExoSchema(TodoPorts, (b) => {
        b.el('li', null, (li) => { li.textPort(TodoPorts.TITLE); });
    });
    const todoMachine = withOIMEffects(
        createExoMachine<TExoDomNode, TTodoSlot, { slot: TTodoSlot }>(todoSchema, { createInitialState: (_c, slot) => ({ slot }) }),
        (effect) => { effect((c) => { c.text(TodoPorts.TITLE, c.state.slot.entity?.title ?? ''); }); },
    );

    const ListPorts = exoPorts({ ITEMS: EXO_PORT_CHILDREN, SHOWN: EXO_PORT_TEXT });
    const listSchema = createExoSchema(ListPorts, (b) => {
        b.el('section', null, (section) => {
            section.el('h1', null, (h1) => { h1.textPort(ListPorts.SHOWN); });
            section.el('ul', null, (ul) => { ul.childrenPort(ListPorts.ITEMS); });
        });
    });
    const listMachine = withOIMEffects(
        withOIMBucketList(
            createExoMachine<TExoDomNode, unknown, { items: TExoChildList }>(listSchema, {
                createInitialState: (c) => ({ items: c.childList(ListPorts.ITEMS) }),
            }),
            {
                selectChildList: (c) => c.state.items,
                memberMachine: todoMachine,
                selectBucketSlot: () => todosByDone.getSlotByKey(filter.getSingleSlot().entity?.shown ?? 'active'),
            },
        ),
        (effect) => { effect((c) => { c.text(ListPorts.SHOWN, filter.getSingleSlot().entity?.shown ?? ''); }); },
    );

    const root = document.createElement('div');
    document.body.appendChild(root);
    const backend = composeExoPlugins(withExoChildList(withExoCompiler(new ExoDomBackend())), {
        exodraPlugin: () => exodraPlugin,
    });
    const render = () => backend.render(listMachine, root);
    const items = (): HTMLLIElement[] => Array.from(root.querySelectorAll('li'));
    const titles = (): string[] => items().map((li) => li.textContent ?? '');
    return { db, todos, todosByDone, todosByDoneContentService, filter, exodraPlugin, render, root, items, titles };
}
