import {
    EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts, wireExoNode,
} from '@exodra/core';
import { ExoDomBackend, withExoCompiler } from '@exodra/dom';
import type { TExoDomNode } from '@exodra/dom';
import {
    OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService, createOIMEntityContentService,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import type { TOIMBucketContentSlot, TOIMBucketSlotsArrayStore, TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin } from '../../src/OIMExodraPlugin';
import { withOIMBucketChildren } from '../../src/withOIMBucketChildren';
import { withOIMEffects } from '../../src/withOIMEffects';

export type TTodo = { id: string; title: string; done: boolean };
type TTodoSlot = TOIMEntitySlot<TTodo, string>;
type TTodosParams = { readonly todosSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TTodoSlot>, TTodoSlot> };

export function createTodoFixture() {
    const db = new OIMDB();
    const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
    const todosByDoneContentService = new OIMPositionalArrayBucketContentService<TTodoSlot, string>({ bucketCommands: new OIMBucketCommands({}) });
    const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
        selectKey: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
        slotContentService: todosByDoneContentService,
    });
    const filter = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ shown: 'done' | 'active'; rev?: number }>() });
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
        withOIMBucketChildren(
            createExoMachine<TExoDomNode, TTodosParams, Record<string, never>>(listSchema, {}),
            {
                childrenPort: ListPorts.ITEMS,
                memberMachine: todoMachine,
                selectBucketSlot: (params) => params.todosSlot,
            },
        ),
        (effect) => { effect((c) => { c.text(ListPorts.SHOWN, filter.getSingleSlot().entity?.shown ?? ''); }); },
    );

    const BoardPorts = exoPorts({ LIST: EXO_PORT_CHILDREN });
    const boardSchema = createExoSchema(BoardPorts, (b) => {
        b.el('main', null, (main) => { main.childrenPort(BoardPorts.LIST); });
    });
    const boardMachine = withOIMEffects(
        createExoMachine<TExoDomNode, unknown, { list: TExoDomNode }>(boardSchema, {
            createInitialState: (c) => {
                const list = c.createExoNode(listMachine as never);
                c.appendChild(BoardPorts.LIST, list);
                return { list };
            },
        }),
        (effect) => {
            effect((c) => { wireExoNode(c.state.list, { todosSlot: todosByDone.getSlotByKey(filter.getSingleSlot().entity?.shown ?? 'active') }); });
        },
    );

    const root = document.createElement('div');
    document.body.appendChild(root);
    const backend = composeExoPlugins(withExoCompiler(new ExoDomBackend()), {
        exodraPlugin: () => exodraPlugin,
    });
    const render = () => backend.render(boardMachine, root);
    const items = (): HTMLLIElement[] => Array.from(root.querySelectorAll('li'));
    const titles = (): string[] => items().map((li) => li.textContent ?? '');
    return { db, todos, todosByDone, todosByDoneContentService, filter, exodraPlugin, render, root, items, titles };
}
