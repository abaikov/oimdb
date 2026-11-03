import { EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts } from '@exodra/core';
import { ExoDomBackend, withExoChildList, withExoCompiler } from '@exodra/dom';
import type { TExoChildList, TExoDomNode } from '@exodra/dom';
import {
    OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin } from '../src/OIMExodraPlugin';
import { withOIMBucketList } from '../src/withOIMBucketList';
import { withOIMEffects } from '../src/withOIMEffects';

type TProject = { id: string; archived: boolean };
type TTask = { id: string; projectId: string; title: string };

describe('what a nested bucket list keeps', () => {
    it('shows the inner members once when the outer member leaves and comes back', () => {
        const db = new OIMDB();
        const projects = createOIMEntitySlotCollectionStoreAggregate<TProject>(db);
        const tasks = createOIMEntitySlotCollectionStoreAggregate<TTask>(db);
        const projectsByArchived = createOIMSlotCollectionIndexStoreAggregate(projects, {
            selectKey: (project: TProject): 'archived' | 'open' => (project.archived ? 'archived' : 'open'),
            slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TProject, string>, string>({ bucketCommands: new OIMBucketCommands({}) }),
        });
        const tasksByProject = createOIMSlotCollectionIndexStoreAggregate(tasks, {
            selectKey: (task: TTask): string => task.projectId,
            slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TTask, string>, string>({ bucketCommands: new OIMBucketCommands({}) }),
        });
        const exodraPlugin = new OIMExodraPlugin({ db });

        const TaskPorts = exoPorts({ TITLE: EXO_PORT_TEXT });
        const taskMachine = withOIMEffects(
            createExoMachine<TExoDomNode, TOIMEntitySlot<TTask, string>, { slot: TOIMEntitySlot<TTask, string> }>(
                createExoSchema(TaskPorts, (b) => { b.el('li', null, (li) => { li.textPort(TaskPorts.TITLE); }); }),
                { createInitialState: (_c, slot) => ({ slot }) },
            ),
            (effect) => { effect((c) => { c.text(TaskPorts.TITLE, c.state.slot.entity?.title ?? ''); }); },
        );
        const ProjectPorts = exoPorts({ TASKS: EXO_PORT_CHILDREN });
        const projectMachine = withOIMBucketList(
            createExoMachine<TExoDomNode, TOIMEntitySlot<TProject, string>, { slot: TOIMEntitySlot<TProject, string>; tasks: TExoChildList }>(
                createExoSchema(ProjectPorts, (b) => { b.el('ol', null, (ol) => { ol.childrenPort(ProjectPorts.TASKS); }); }),
                { createInitialState: (c, slot) => ({ slot, tasks: c.childList(ProjectPorts.TASKS) }) },
            ),
            { selectChildList: (c) => c.state.tasks, memberMachine: taskMachine, selectBucketSlot: (c) => tasksByProject.getSlotByKey(c.state.slot.key) },
        );
        const BoardPorts = exoPorts({ PROJECTS: EXO_PORT_CHILDREN });
        const boardMachine = withOIMBucketList(
            createExoMachine<TExoDomNode, unknown, { projects: TExoChildList }>(
                createExoSchema(BoardPorts, (b) => { b.el('section', null, (section) => { section.childrenPort(BoardPorts.PROJECTS); }); }),
                { createInitialState: (c) => ({ projects: c.childList(BoardPorts.PROJECTS) }) },
            ),
            { selectChildList: (c) => c.state.projects, memberMachine: projectMachine, selectBucketSlot: () => projectsByArchived.getSlotByKey('open') },
        );

        projects.writeSlotContentByKey('p', { id: 'p', archived: false });
        tasks.writeSlotContentByKey('t1', { id: 't1', projectId: 'p', title: 'Write' });
        tasks.writeSlotContentByKey('t2', { id: 't2', projectId: 'p', title: 'Test' });
        db.flush();
        const root = document.createElement('div');
        document.body.appendChild(root);
        composeExoPlugins(withExoChildList(withExoCompiler(new ExoDomBackend())), { exodraPlugin: () => exodraPlugin }).render(boardMachine, root);
        expect(root.querySelectorAll('li')).toHaveLength(2);

        projects.slotContentService.updateEntity(projects.getSlotByKey('p'), { archived: true });
        db.flush();
        projects.slotContentService.updateEntity(projects.getSlotByKey('p'), { archived: false });
        db.flush();

        expect(Array.from(root.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Write', 'Test']);
    });
});
