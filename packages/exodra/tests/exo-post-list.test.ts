import { OIMEventQueue, createOIMCollectionKit } from '@oimdb/core';
import { exoDb, exoRows } from '../src';

type Post = { id: string; title: string; createdAt: number };
type Comment = { id: string; postId: string; body: string };

/**
 * A LIST of posts, each with its own comment list — nested `exoRows`. The thing worth proving is
 * containment: a change inside one post must not disturb the other posts, and adding a post must not
 * rebuild the comment lists of the posts that were already there.
 */
const setup = () => {
    const queue = new OIMEventQueue();
    const postsKit = createOIMCollectionKit<Post, string>(queue, {
        selectPk: p => p.id,
    });
    const commentsKit = createOIMCollectionKit<Comment, string>(queue, {
        selectPk: c => c.id,
    });
    const postsByDate = postsKit.indexFactory.derivedArrayGlobalIndex({
        orderBy: p => p.createdAt,
    });
    const byPost = commentsKit.indexFactory.derivedArrayIndex<string>(
        c => c.postId,
        { orderBy: c => c.id }
    );

    postsKit.collection.upsertMany([
        { id: 'p1', title: 'First', createdAt: 1 },
        { id: 'p2', title: 'Second', createdAt: 2 },
    ]);
    commentsKit.collection.upsertMany([
        { id: 'c1', postId: 'p1', body: 'a' },
        { id: 'c2', postId: 'p2', body: 'b' },
    ]);
    queue.flush();

    const db = exoDb({
        posts: { kit: postsKit, indexes: { postsByDate } },
        comments: { kit: commentsKit, indexes: { byPost } },
    });
    return { queue, postsKit, commentsKit, db };
};

test('list of posts with nested comment lists: changes stay contained', () => {
    const { queue, postsKit, commentsKit, db } = setup();

    const n = {
        postRows: 0,
        commentRows: 0,
        outerRebuild: 0,
        innerRebuild: {} as Record<string, number>,
        postText: 0,
        commentText: 0,
    };

    const posts = exoRows(db.posts.postsByDate.pks(), postPk => {
        n.postRows++;
        const post = db.posts.byPk(postPk);
        post.subscribe(() => n.postText++);

        const comments = exoRows(db.comments.byPost.pks(postPk), commentPk => {
            n.commentRows++;
            const comment = db.comments.byPk(commentPk);
            comment.subscribe(() => n.commentText++);
            return { pk: commentPk, comment };
        });
        n.innerRebuild[postPk] = 0;
        comments.subscribe(() => n.innerRebuild[postPk]++);

        return { pk: postPk, post, comments };
    });
    posts.subscribe(() => n.outerRebuild++);

    const firstPosts = posts.getValue();
    // Materialise the nested lists once, as a render would.
    for (const p of firstPosts) p.comments.getValue();
    expect(firstPosts.map(p => p.pk)).toEqual(['p1', 'p2']);
    expect(n.postRows).toBe(2);
    expect(n.commentRows).toBe(2);

    // (a) A post's title changes → only that post's binding. No list moves.
    postsKit.collection.upsertOneByPk('p1', { title: 'First!' });
    queue.flush();
    expect(n.postText).toBe(1);
    expect(n.outerRebuild).toBe(0);
    expect(n.innerRebuild.p1).toBe(0);
    expect(posts.getValue()).toBe(firstPosts);

    // (b) A comment's body changes → only that comment's binding.
    commentsKit.collection.upsertOneByPk('c1', { body: 'edited' });
    queue.flush();
    expect(n.commentText).toBe(1);
    expect(n.innerRebuild.p1).toBe(0); // membership unchanged → same array
    expect(n.outerRebuild).toBe(0);
    expect(firstPosts[0].comments.getValue()[0].comment.getValue()?.body).toBe(
        'edited'
    );

    // (c) A comment is added to p1 → ONLY p1's inner list rebuilds.
    commentsKit.collection.upsertOne({ id: 'c3', postId: 'p1', body: 'c' });
    queue.flush();
    expect(n.innerRebuild.p1).toBe(1);
    expect(n.innerRebuild.p2).toBe(0); // the other post is untouched
    expect(n.outerRebuild).toBe(0); // the post list is untouched
    expect(n.commentRows).toBe(3); // only the new comment rendered
    expect(n.postRows).toBe(2); // no post row rebuilt
    expect(firstPosts[0].comments.getValue().map(c => c.pk)).toEqual([
        'c1',
        'c3',
    ]);

    // (d) A post is added → the outer list rebuilds, only the new post row renders, and the
    //     existing posts keep their identity AND their already-built comment lists.
    postsKit.collection.upsertOne({ id: 'p3', title: 'Third', createdAt: 3 });
    queue.flush();
    const grown = posts.getValue();
    expect(grown.map(p => p.pk)).toEqual(['p1', 'p2', 'p3']);
    expect(n.outerRebuild).toBe(1);
    expect(n.postRows).toBe(3); // only p3
    expect(grown[0]).toBe(firstPosts[0]); // p1's row object survived…
    expect(grown[0].comments).toBe(firstPosts[0].comments); // …and so did its comment list
    expect(n.innerRebuild.p1).toBe(1); // not rebuilt again by the outer change
    expect(n.commentRows).toBe(3); // no comment re-rendered

    // (e) A post is removed → its row and nested list are dropped; the rest are untouched.
    postsKit.collection.removeOneByPk('p2');
    queue.flush();
    expect(posts.getValue().map(p => p.pk)).toEqual(['p1', 'p3']);
    expect(n.outerRebuild).toBe(2);
    expect(n.postRows).toBe(3); // nothing new rendered
    expect(n.commentRows).toBe(3);
});

test('the compact facade form has the same containment', () => {
    const { queue, commentsKit, db } = setup();

    let postRenders = 0;
    let commentRenders = 0;

    // One top-level call; the inner list is just an expression inside the row's markup.
    const posts = db.posts.postsByDate.rows((post, postPk) => {
        postRenders++;
        return {
            pk: postPk,
            post,
            comments: db.comments.byPost.rows(postPk, (comment, pk) => {
                commentRenders++;
                return { pk, comment };
            }),
        };
    });

    const first = posts.getValue();
    posts.subscribe(() => undefined);
    for (const p of first) p.comments.subscribe(() => undefined);
    for (const p of first) p.comments.getValue();
    expect(first.map(p => p.pk)).toEqual(['p1', 'p2']);
    expect(postRenders).toBe(2);
    expect(commentRenders).toBe(2);

    // A comment added to p1 touches p1's inner list only.
    commentsKit.collection.upsertOne({ id: 'c9', postId: 'p1', body: 'x' });
    queue.flush();
    expect(posts.getValue()).toBe(first); // the post list never moved
    expect(postRenders).toBe(2);
    expect(commentRenders).toBe(3); // only the new comment
    expect(first[0].comments.getValue().map(c => c.pk)).toEqual(['c1', 'c9']);
    expect(first[1].comments.getValue().map(c => c.pk)).toEqual(['c2']);
});
