import type { BenchConsumer } from './consumer';
import { compareRows, onSecondAxis } from './dataset';
import type { TRow } from './dataset';
import type { TCellConfig, TRelationConfig } from './types';

/**
 * The two helpers every adapter uses, so that the one thing that must be
 * identical between them actually is.
 *
 * `deliver` is the ONLY way an adapter is allowed to reach the consumer. It
 * fixes the call pattern — begin, one `row` per visible row in view order, end
 * — so no adapter can render a different number of rows, in a different order,
 * or split one state across two deliveries.
 *
 * `visibleInto` is the naive derivation: the rows of one group, in order, up to the
 * window. One implementation rather than a dozen copies, so the differences the
 * report shows are differences in the REACTIVITY and not in whose filter loop was
 * written more carefully. Libraries with a real index (oimdb, TinyBase, SignalDB,
 * LokiJS, TanStack DB) do not call it, and that is the comparison.
 *
 * IT MUST BE GIVEN ROWS READ OUT OF THE STORE. Handing it the harness's own array
 * would answer the question without asking the library anything.
 *
 * `visible` IS ALSO HANDED TO `begin` AS THE DELIVERY WITNESS — see
 * `BenchConsumer.deliveredRows`. It is the reference and nothing more: one
 * argument and one store PER DELIVERY, none per row, and the array is not read
 * again until the verify pass. `consumerFloor` does not call this function: its
 * run drives `consumer.begin`, `row` and `end` itself, and its `begin` takes no
 * witness.
 */
export const deliver = (
    consumer: BenchConsumer,
    visible: readonly TRow[],
    window: number
): void => {
    consumer.begin(visible);
    const upto = visible.length < window ? visible.length : window;
    for (let i = 0; i < upto; i++) {
        const row = visible[i];
        consumer.row(row.id, row.rank, row.label);
    }
    consumer.end();
};

/**
 * ONE CELL DELIVERY: the pinned rows, in pin order, through ONE column — and the
 * only way an adapter may reach a cell view, for the reason `deliver` is the
 * only way it may reach a window view.
 *
 * The shape is fixed here so the two cell views cannot differ by anything except
 * the column: same rows, count, order and line format (`id rank text`), so the gap
 * between the `label` half and the `note` half is the routing and nothing else.
 *
 * `text` IS THE ONLY THING THAT COMES OUT OF THE STORE. `ids` and `ranks` are the
 * address and are the harness's (see {@link TCellConfig}), so one delivery reads
 * exactly one column per row through the library's own accessor; an adapter filling
 * `text` from anything else is caught by the population audit.
 *
 * The buffer is the caller's and is meant to be reused: a fresh array per delivery
 * would put an allocation in front of every adapter equally.
 */
export const deliverCells = (
    consumer: BenchConsumer,
    cells: TCellConfig,
    text: readonly string[]
): void => {
    consumer.begin();
    const ids = cells.ids;
    const ranks = cells.ranks;
    for (let i = 0; i < ids.length; i++) consumer.row(ids[i], ranks[i], text[i]);
    consumer.end();
};

/**
 * ONE RELATION DELIVERY: the relation rows, in order, each carrying ONE VALUE
 * THAT CAME FROM SOMEWHERE ELSE — and the only way an adapter may reach either
 * relation view.
 *
 * {@link deliverCells}'S SHAPE, AND DELIBERATELY NOT THAT FUNCTION. A cell view
 * renders a COLUMN OF THE ROW ON THE LINE; these render something not on that row
 * at all — view A's text is the name of a SECOND-TYPE record this row points at,
 * view B's the mark of a record keyed by TWO identities. Identical line format so
 * the two relation views differ by subject and nothing else; separate function
 * because a reader arriving from a relation adapter would otherwise be told the
 * wrong thing about what `text` is.
 *
 * `text` IS THE ONLY THING THAT COMES OUT OF THE STORE, as in `deliverCells`.
 */
export const deliverRelation = (
    consumer: BenchConsumer,
    config: TRelationConfig,
    text: readonly string[]
): void => {
    consumer.begin();
    const ids = config.ids;
    const ranks = config.ranks;
    for (let i = 0; i < ids.length; i++) consumer.row(ids[i], ranks[i], text[i]);
    consumer.end();
};

/**
 * ONE CHURN DELIVERY — the only way an adapter may reach the churn consumer,
 * and the only evidence this suite has that a mount was real.
 *
 * ONE LINE, and the TEXT carries the answer rather than the count of lines. After
 * a churn script mounts N subscribers, writes one row and settles, the line says
 * `${woke}:${label}`:
 *
 *  - `woke` is HOW MANY SUBSCRIBERS RAN THEIR BODY in the frame just closed,
 *    incremented by the bodies themselves and by nothing else, so a mount that
 *    wired nothing cannot produce it. The reference model states independently
 *    what it has to be.
 *  - `reads[0]` is what SUBSCRIBER 0 READ OUT OF THE STORE. A binding that counted
 *    wake-ups without reading anything fails on it.
 *  - on verify and proof passes only, `#standing/hash` folds EVERY standing
 *    subscriber's read by slot, so one on the wrong source fails; timed samples skip it.
 */
let churnReadsAudited = false;

export const setChurnReadsAudited = (audited: boolean): void => {
    churnReadsAudited = audited;
};

export const foldChurnReads = (reads: readonly (string | undefined)[]): string => {
    let hash = 0x811c9dc5;
    let standing = 0;
    for (let at = 0; at < reads.length; at++) {
        const read = reads[at];
        if (read === undefined) continue;
        standing++;
        const entry = `${at}=${read}\u0001`;
        for (let i = 0; i < entry.length; i++) {
            hash ^= entry.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return `${standing}/${(hash >>> 0).toString(16)}`;
};

export const churnLineOf = (woke: number, reads: readonly (string | undefined)[]): string =>
    churnReadsAudited ? `${woke}:${reads[0] ?? ''}#${foldChurnReads(reads)}` : `${woke}:${reads[0] ?? ''}`;

export const deliverChurn = (
    consumer: BenchConsumer,
    id: string,
    rank: number,
    woke: number,
    reads: readonly (string | undefined)[]
): void => {
    consumer.begin();
    consumer.row(id, rank, churnLineOf(woke, reads));
    consumer.end();
};

/**
 * ONE SINGLE-VALUE DELIVERY — one line, carrying one value — and the only way a
 * SINGLE BINDING may reach either of its consumers.
 *
 * {@link deliverChurn}'S SHAPE AND DELIBERATELY NOT THAT FUNCTION: that one folds
 * a subscriber COUNT into its text because a mount is what it is about, and this
 * one carries the value alone. Sharing it would put a `${woke}:` prefix in front
 * of a family that has nothing to count, or make the churn text optional.
 *
 * `name` IS THE ADDRESS AND IS THE HARNESS'S — see {@link TSingleConfig} — so
 * `value` is the only thing that comes out of the store and one delivery reads
 * exactly one value through the library's own accessor. THE RANK IS A CONSTANT
 * ZERO for the same reason there is no rank: a single value is not ordered against
 * anything, and a number that varied here would be an address the store was being
 * asked for and does not have.
 */
export const deliverSingle = (
    consumer: BenchConsumer,
    name: string,
    value: string
): void => {
    consumer.begin();
    consumer.row(name, 0, value);
    consumer.end();
};

/**
 * ONE DELIVERY OF A PAGE — `count` rows starting at `from` — and the only way a
 * READ BINDING may reach a consumer.
 *
 * `deliver` with the start of the page made explicit. `deliver` IS LEFT AS IT IS
 * rather than expressed through this: thirteen measured rows go through it, and a
 * helper that grew an argument to serve three new rows would have changed the cost
 * of the thirteen.
 *
 * A SHORT ARRAY PRODUCES A SHORT RENDER, deliberately. The consumer folds its row
 * COUNT into every state, so a page short because the store lost a row fails the
 * digest rather than passing as a page with a gap.
 */
export const deliverPage = (
    consumer: BenchConsumer,
    visible: readonly TRow[],
    from: number,
    count: number
): void => {
    consumer.begin();
    const upto = Math.min(visible.length, from + count);
    for (let i = from; i < upto; i++) {
        const row = visible[i];
        consumer.row(row.id, row.rank, row.label);
    }
    consumer.end();
};

/**
 * THE SAME TOP-K SELECTION AS {@link visibleInto}, THROUGH TWO PREDICATES — the
 * group AND the second axis.
 *
 * A COPY RATHER THAN A PARAMETER: `visibleInto` is on the delivery path of nine
 * adapters across thirteen rows, and a predicate argument would put one indirect
 * call per candidate row in front of every one of them to serve one row none
 * appears in. The two bodies differ by ONE clause and are meant to be diffed by eye.
 *
 * The predicate is imported rather than spelled out: it is a fact about the
 * dataset, and the independent statement of it lives in the reference model.
 */
export const visibleOnAxisInto = (
    out: TRow[],
    rows: Iterable<TRow>,
    group: string,
    window: number
): TRow[] => {
    let held = 0;
    for (const row of rows) {
        if (row.group !== group) continue;
        if (!onSecondAxis(row.id)) continue;
        if (held >= window) {
            if (compareRows(row, out[held - 1]) >= 0) continue;
            let at = held - 1;
            while (at > 0 && compareRows(out[at - 1], row) > 0) {
                out[at] = out[at - 1];
                at--;
            }
            out[at] = row;
            continue;
        }
        let at = held++;
        while (at > 0 && compareRows(out[at - 1], row) > 0) {
            out[at] = out[at - 1];
            at--;
        }
        out[at] = row;
    }
    out.length = held;
    return out;
};

/**
 * THE WHOLE OF ONE GROUP, IN VIEW ORDER, AS IDS — what an adapter answers
 * {@link TBinding.groupOrder} with when it has NO grouping structure of its own
 * and derives its views by walking the population.
 *
 * A full filter and a full sort rather than the top-k above: the grouping audit is
 * about an INDEX and an index has no window, and the audit is untimed.
 *
 * WHAT IT PROVES FOR THE ROWS THAT USE IT: nothing the column audit did not already
 * prove. An adapter with no grouping has no second structure that could disagree
 * with its columns. The check bites on the adapters that keep one — see
 * {@link orderedIdsOfRows}.
 */
export const orderedIdsOfGroup = (
    rows: Iterable<TRow>,
    group: string
): readonly string[] => {
    const held: TRow[] = [];
    for (const row of rows) {
        if (row.group === group) held.push(row);
    }
    return orderedIdsOfRows(held);
};

/**
 * THE SAME ANSWER FROM A BUCKET THAT IS ALREADY THE GROUP — for an adapter whose
 * store KEEPS a grouping and can hand over its rows without filtering.
 *
 * The arm of the grouping audit that actually bites: the ids come out of the
 * store's own index, so a bucket that lost a row, gained one, or orders them as
 * its own view would render wrongly parts from the model here — none of which is
 * visible to a column audit.
 *
 * IT SORTS RATHER THAN TRUSTING THE STORED ORDER, and that is not a hole: what the
 * audit compares is what the store's VIEW would show, so a store sorting at read
 * answers exactly as it renders and one keeping it ordered gets a no-op. What
 * neither shape can hide is a ROW that should not be there or one that should.
 */
export const orderedIdsOfRows = (held: TRow[]): readonly string[] => {
    held.sort(compareRows);
    const ids: string[] = new Array(held.length);
    for (let i = 0; i < held.length; i++) ids[i] = held[i].id;
    return ids;
};

/**
 * A TOP-K SELECTION, not a sort.
 *
 * The output is what `rows.filter(inGroup).sort(compareRows).slice(0, window)`
 * produces, to the byte, and that is a fact rather than a hope: `compareRows` is a
 * TOTAL order over this dataset — rank, then id, ids unique — so the sorted
 * sequence is unique. Nothing depends on the stability of `Array.sort` because
 * nothing can tie. Each row past the first `window` costs ONE comparison unless it
 * belongs on screen, where a full sort orders rows nobody will look at.
 *
 * `out` IS THE CALLER'S, reused across deliveries, so a render allocates nothing.
 * NOT SAFE EVERYWHERE, which is why `visibleOf` still exists: several of these
 * libraries decide "did this change?" by comparing the derived value with `===` —
 * a preact/alien computed, an effector `.map`, a nanostores computed, a Jotai
 * derived atom, a MobX computed — so handing back the same array would tell them
 * nothing changed and the consumer would never be driven again.
 */
export const visibleInto = (
    out: TRow[],
    rows: Iterable<TRow>,
    group: string,
    window: number
): TRow[] => {
    let held = 0;
    for (const row of rows) {
        if (row.group !== group) continue;
        if (held >= window) {
            if (compareRows(row, out[held - 1]) >= 0) continue;
            let at = held - 1;
            while (at > 0 && compareRows(out[at - 1], row) > 0) {
                out[at] = out[at - 1];
                at--;
            }
            out[at] = row;
            continue;
        }
        let at = held++;
        while (at > 0 && compareRows(out[at - 1], row) > 0) {
            out[at] = out[at - 1];
            at--;
        }
        out[at] = row;
    }
    out.length = held;
    return out;
};

/**
 * The same selection into a FRESH array, for the adapters whose reactivity reads
 * the result's identity — see the note on `visibleInto`. The array is the WINDOW's
 * size and not the group's, which is the other half of what the old implementation
 * cost.
 */
export const visibleOf = (
    rows: Iterable<TRow>,
    group: string,
    window: number
): TRow[] => visibleInto([], rows, group, window);
