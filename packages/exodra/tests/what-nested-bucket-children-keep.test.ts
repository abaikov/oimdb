import { EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts } from '@exodra/core';
import { ExoDomBackend, withExoCompiler } from '@exodra/dom';
import type { TExoDomNode } from '@exodra/dom';
import {
    OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService,
    createOIMEntitySlotCollectionStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin } from '../src/OIMExodraPlugin';
import { withOIMBucketChildren } from '../src/withOIMBucketChildren';
import { withOIMEffects } from '../src/withOIMEffects';

type TProject = { id: string; archived: boolean };
type TTask = { id: string; projectId: string; title: string };

describe('what nested bucket children keep', () => {
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
        const projectMachine = withOIMBucketChildren(
            createExoMachine<TExoDomNode, TOIMEntitySlot<TProject, string>, Record<string, never>>(
                createExoSchema(ProjectPorts, (b) => { b.el('ol', null, (ol) => { ol.childrenPort(ProjectPorts.TASKS); }); }),
                {},
            ),
            { childrenPort: ProjectPorts.TASKS, memberMachine: taskMachine, selectBucketSlot: (projectSlot) => tasksByProject.getSlotByKey(projectSlot.key) },
        );
        const BoardPorts = exoPorts({ PROJECTS: EXO_PORT_CHILDREN });
        const boardMachine = withOIMBucketChildren(
            createExoMachine<TExoDomNode, unknown, Record<string, never>>(
                createExoSchema(BoardPorts, (b) => { b.el('section', null, (section) => { section.childrenPort(BoardPorts.PROJECTS); }); }),
                {},
            ),
            { childrenPort: BoardPorts.PROJECTS, memberMachine: projectMachine, selectBucketSlot: () => projectsByArchived.getSlotByKey('open') },
        );

        projects.writeSlotContentByKey('p', { id: 'p', archived: false });
        tasks.writeSlotContentByKey('t1', { id: 't1', projectId: 'p', title: 'Write' });
        tasks.writeSlotContentByKey('t2', { id: 't2', projectId: 'p', title: 'Test' });
        db.flush();
        const root = document.createElement('div');
        document.body.appendChild(root);
        composeExoPlugins(withExoCompiler(new ExoDomBackend()), { exodraPlugin: () => exodraPlugin }).render(boardMachine, root);
        expect(root.querySelectorAll('li')).toHaveLength(2);

        projects.slotContentService.updateEntity(projects.getSlotByKey('p'), { archived: true });
        db.flush();
        projects.slotContentService.updateEntity(projects.getSlotByKey('p'), { archived: false });
        db.flush();

        expect(Array.from(root.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Write', 'Test']);
    });
});
