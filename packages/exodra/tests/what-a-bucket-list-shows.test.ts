import { createTodoFixture } from './support/createTodoFixture';

describe('what a bucket list shows', () => {
    it('shows the members of the selected bucket in order, and follows inserts and removals', () => {
        const { db, todos, render, titles } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        todos.writeSlotContentByKey('2', { id: '2', title: 'Test', done: false });
        db.flush();
        render();
        expect(titles()).toEqual(['Write', 'Test']);

        todos.writeSlotContentByKey('3', { id: '3', title: 'Ship', done: false });
        db.flush();
        expect(titles()).toEqual(['Write', 'Test', 'Ship']);

        todos.slotContentService.updateEntity(todos.getSlotByKey('2'), { done: true });
        db.flush();
        expect(titles()).toEqual(['Write', 'Ship']);
    });

    it('gives a member that comes back the element it had', () => {
        const { db, todos, render, items } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        db.flush();
        render();
        const first = items()[0];

        todos.slotContentService.updateEntity(todos.getSlotByKey('1'), { done: true });
        db.flush();
        expect(items()).toEqual([]);
        todos.slotContentService.updateEntity(todos.getSlotByKey('1'), { done: false });
        db.flush();

        expect(items()[0]).toBe(first);
    });

    it('updates a member through its column watch', () => {
        const { db, todos, render, titles } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        db.flush();
        render();

        todos.slotContentService.updateEntity(todos.getSlotByKey('1'), { title: 'Rewrite' });
        db.flush();

        expect(titles()).toEqual(['Rewrite']);
    });

    it('switches to the bucket a tracked read of the filter selects, and a one-line effect follows it', () => {
        const { db, todos, filter, render, root, titles } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        todos.writeSlotContentByKey('2', { id: '2', title: 'Test', done: true });
        db.flush();
        render();
        expect(titles()).toEqual(['Write']);

        filter.writeSingleSlotContent({ shown: 'done' });
        db.flush();

        expect(titles()).toEqual(['Test']);
        expect(root.querySelector('h1')?.textContent).toBe('done');
    });
});

describe('what a parked member node does when its slot goes', () => {
    it('is unmounted and leaves the claimed cell empty once the engine releases the slot', () => {
        const { db, todos, exodraPlugin, render, items } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        db.flush();
        render();
        const todoSlot = todos.getSlotByKey('1');
        todos.slotContentService.updateEntity(todoSlot, { done: true });
        db.flush();
        expect(todoSlot.data?.[exodraPlugin.slotDataCell]).toBeDefined();

        todoSlot.clearSlotContent();
        db.flush();

        expect(items()).toEqual([]);
        expect(todoSlot.data?.[exodraPlugin.slotDataCell]).toBeUndefined();
    });
});

describe('what a bucket list does on a move and on teardown', () => {
    it('moves the node of a member the bucket moved, keeping the element', () => {
        const { db, todos, todosByDone, todosByDoneContentService, render, items, titles } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        todos.writeSlotContentByKey('2', { id: '2', title: 'Test', done: false });
        db.flush();
        render();
        const write = items()[0];

        todosByDoneContentService.moveBucketMemberSlotToPosition(todosByDone.getSlotByKey('active'), 0, 1);
        db.flush();

        expect(titles()).toEqual(['Test', 'Write']);
        expect(items()[1]).toBe(write);
    });

    it('unmounts its parked nodes and stops following the bucket when the list goes', () => {
        const { db, todos, exodraPlugin, render, root } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        db.flush();
        const unmount = render();
        const todoSlot = todos.getSlotByKey('1');
        todos.slotContentService.updateEntity(todoSlot, { done: true });
        db.flush();

        unmount();
        todos.writeSlotContentByKey('2', { id: '2', title: 'Test', done: false });
        db.flush();

        expect(todoSlot.data?.[exodraPlugin.slotDataCell]).toBeUndefined();
        expect(root.querySelectorAll('li')).toHaveLength(0);
    });
});

describe('what a bucket list does when its selection reruns or another list holds the node', () => {
    it('keeps its nodes when the selection reruns onto the same bucket', () => {
        const { db, todos, filter, render, items } = createTodoFixture();
        todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        db.flush();
        render();
        const first = items()[0];

        filter.writeSingleSlotContent({ shown: 'active' });
        db.flush();

        expect(items()).toEqual([first]);
    });

    it('unmounts a leaving node whose slot already has a node parked by another list, and keeps the first', () => {
        const first = createTodoFixture();
        first.todos.writeSlotContentByKey('1', { id: '1', title: 'Write', done: false });
        first.db.flush();
        first.render();
        const secondRender = first.render;
        secondRender();
        expect(first.titles()).toEqual(['Write', 'Write']);
        const todoSlot = first.todos.getSlotByKey('1');

        first.todos.slotContentService.updateEntity(todoSlot, { done: true });
        first.db.flush();

        expect(first.items()).toEqual([]);
        expect(todoSlot.data?.[first.exodraPlugin.slotDataCell]).toBeDefined();
    });
});
