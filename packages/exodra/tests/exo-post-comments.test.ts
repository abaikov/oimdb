import { OIMEventQueue, createOIMCollectionKit } from '@oimdb/core';
import { exoDb, exoRows } from '../src';

type Post = { id: string; title: string };
type Comment = { id: string; postId: string; body: string };

/**
 * The canonical screen: a post, its comment list, and the comments themselves. Three independent
 * sources of change, each of which must reach exactly the node that depends on it — and nothing else.
 */
const setup = () => {
    const queue = new OIMEventQueue();
    const postsKit = createOIMCollectionKit<Post, string>(queue, {
        selectPk: p => p.id,
    });
    const commentsKit = createOIMCollectionKit<Comment, string>(queue, {
        selectPk: c => c.id,
    });
    const byPost = commentsKit.indexFactory.derivedArrayIndex<string>(
        c => c.postId,
        { orderBy: c => c.id }
    );

    postsKit.collection.upsertOne({ id: 'p1', title: 'Hello' });
    commentsKit.collection.upsertMany([
        { id: 'c1', postId: 'p1', body: 'first' },
        { id: 'c2', postId: 'p1', body: 'second' },
    ]);
    queue.flush();

    const db = exoDb({
        posts: { kit: postsKit },
        comments: { kit: commentsKit, indexes: { byPost } },
    });
    return { queue, postsKit, commentsKit, db };
};

test('post + its comments: every change reaches only what depends on it', () => {
    const { queue, postsKit, commentsKit, db } = setup();

    const counters = { title: 0, listRebuild: 0, rowRenders: 0, bodies: 0 };

    // 1. The post itself.
    const post = db.posts.byPk('p1');
    post.subscribe(() => counters.title++);

    // 2. The comment LIST for this post — membership comes from the index.
    const rows = exoRows(db.comments.byPost.pks('p1'), pk => {
        counters.rowRenders++;
        // 3. Each comment follows its own entity.
        const body = db.comments.byPk(pk);
        body.subscribe(() => counters.bodies++);
        return { pk, body };
    });
    rows.subscribe(() => counters.listRebuild++);

    const first = rows.getValue();
    expect(first.map(r => r.pk)).toEqual(['c1', 'c2']);
    expect(counters.rowRenders).toBe(2);

    // (a) The POST changes → only the post's own binding fires.
    postsKit.collection.upsertOneByPk('p1', { title: 'Hello again' });
    queue.flush();
    expect(counters.title).toBe(1);
    expect(counters.listRebuild).toBe(0); // the comment list is untouched
    expect(counters.rowRenders).toBe(2); // nothing re-rendered
    expect(counters.bodies).toBe(0);

    // (b) ONE COMMENT changes → only that row's own binding fires.
    commentsKit.collection.upsertOneByPk('c1', { body: 'edited' });
    queue.flush();
    expect(counters.bodies).toBe(1);
    expect(counters.listRebuild).toBe(0); // membership unchanged → same array
    expect(rows.getValue()).toBe(first); // literally the same array back
    expect(counters.rowRenders).toBe(2); // no row was rebuilt
    expect(first[0].body.getValue()?.body).toBe('edited');

    // (c) A COMMENT IS ADDED → membership changes → the list rebuilds, one new row rendered.
    commentsKit.collection.upsertOne({ id: 'c3', postId: 'p1', body: 'third' });
    queue.flush();
    expect(counters.listRebuild).toBe(1);
    expect(counters.rowRenders).toBe(3); // only c3
    const grown = rows.getValue();
    expect(grown.map(r => r.pk)).toEqual(['c1', 'c2', 'c3']);
    expect(grown[0]).toBe(first[0]); // surviving rows keep identity
    expect(counters.title).toBe(1); // the post was not disturbed

    // (d) A COMMENT IS REMOVED → same story in reverse.
    commentsKit.collection.removeOneByPk('c2');
    queue.flush();
    expect(counters.listRebuild).toBe(2);
    expect(rows.getValue().map(r => r.pk)).toEqual(['c1', 'c3']);
    expect(counters.rowRenders).toBe(3); // nothing new to render
});

test('the facade packages exactly that pattern', () => {
    const { queue, commentsKit, db } = setup();

    let renders = 0;
    const rows = db.comments.byPost.rows('p1', (comment, pk) => {
        renders++;
        return { pk, comment };
    });
    const first = rows.getValue();
    rows.subscribe(() => undefined);
    expect(first.map(r => r.pk)).toEqual(['c1', 'c2']);
    expect(renders).toBe(2);

    // Editing a comment updates that row's bindable and rebuilds nothing.
    commentsKit.collection.upsertOneByPk('c2', { body: 'edited' });
    queue.flush();
    expect(rows.getValue()).toBe(first);
    expect(renders).toBe(2);
    expect(first[1].comment.getValue()?.body).toBe('edited');
});
