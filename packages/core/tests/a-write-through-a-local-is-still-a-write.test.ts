/**
 * A WRITE THROUGH A LOCAL IS STILL A WRITE — every file that writes or mutates a
 * field of this engine's plain structs, or a field one of its classes leaves
 * open, pinned; and the ones an alias hides counted with the rest.
 *
 * ─── THE DEFECT THIS FILE WAS OPENED FOR ─────────────────────────────────
 *
 * `OIMComputed.value` had THREE writers in THREE files while the class's own
 * header said `settle` was its only one. The other two were
 * `createOIMComputedCollectionBucketMemo` and `createOIMAutoIndex`, one line
 * each, immediately after the `new`, and both claimed the same exemption:
 * *initialisation and not a write: the object was made one line above and
 * nothing has settled it.*
 *
 * THAT IS AN EXEMPTION BY TIMING AND NOTHING ENFORCED THE TIMING. The field was
 * `public`, so the identical line was legal at any later moment from any file,
 * and what a later one costs is silent. `settle` ends in
 * `this.sameValueGuard(this.value, next)`: a value written from outside makes that
 * `sameValueGuard` answer about something no derivation produced. It says the value
 * held, `changedAt*` does not advance, and the effect reading the derivation is
 * simply not run — no throw, no failing case, a screen that stops redrawing.
 *
 * A computed is a slot, `TOIMComputedSlot`, and its owner is its factory. The
 * value is a field of that slot, and its one writer is `refreshOIMComputedSlot`,
 * which only the owner calls. `value` is on the pin below, and the case at the
 * bottom of this file names that one writer. This file is deliberately not
 * about that one field.
 *
 * ─── WHY NEITHER CENSUS NEXT DOOR COULD HAVE CAUGHT IT ───────────────────
 *
 * `which-side-of-a-slot-owns-which-part.test.ts` reads its field list off FOUR
 * types so that a field cannot arrive on a slot unowned — and `value` is on a
 * FIFTH, `TOIMComputedSlot`, outside that net BY CONSTRUCTION
 * rather than by oversight. `who-may-say-a-bucket-is-in-order.test.ts` watches
 * two words typed out by hand, which is the same limit stated more plainly.
 *
 * So this file answers two questions those two do not: WHICH FIELDS ARE IN THE
 * NET, read off the declarations rather than listed, and WHAT COUNTS AS A WRITE.
 *
 * ─── WHICH FIELDS: TWO HALVES, BOTH READ OFF `src` ───────────────────────
 *
 * THE STRUCTS. Every field declared by every `TOIM*.ts` in `src/` —
 * the fields the house rule about a named sole writer is aimed at. Reading the
 * directory is what puts a SIXTH struct type in the net the day somebody adds
 * one.
 *
 * THE OPEN FIELDS. Every field a class declares `public`, `readonly` or not.
 * `readonly` is the compiler's half and it is erased; it says nothing about who
 * writes the field from inside the class, and a field that loses the modifier
 * would leave a net keyed on it in silence. Keyed on `public`, `value` is in this
 * net both before and after the repair, which is the whole point.
 *
 * A subject has one owner, so three groups are named in {@link OWNED_ELSEWHERE}
 * and taken out. `effects` is put back, and the reason is in that list.
 *
 * ─── WHAT COUNTS AS A WRITE, AND WHY READS ARE NOT COUNTED ───────────────
 *
 * Three shapes, all of them on an OWNER — `x.field`, never a bare `field`:
 *
 *   WRITE   `x.field = …`, and every compound and increment spelling of it.
 *   MUTATE  a change to what the field HOLDS: `x.field.push(…)`,
 *           `x.field.length = 0`, `x.field[i] = …`, `x.field.set(…)`.
 *   ALIAS   the same mutations through a local bound from the field —
 *           `const dependents = holder.effects;` then `dependents[at] = tail;`.
 *
 * READS ARE NOT PINNED, and that is a deliberate difference from
 * `who-may-say-a-bucket-is-in-order.test.ts`, which pins them. `isSorted` has ONE
 * read; `TOIMBucketSlotsArrayStore.bucketMemberSlots` is read on the settle path of every ordered
 * bucket and has ten in one file. Pinning those makes an edit that adds a read
 * fail a check about mutators, and a check that fails for reasons nobody caused
 * is a check somebody turns off. What is claimed here is the MUTATOR, and a new
 * reader costs nothing.
 *
 * BIRTHS ARE NOT PINNED EITHER — the declaration is already load-bearing, since
 * it is what puts the field in the net, and a `field:` inside a `(` is a
 * parameter rather than a birth with no way to tell them apart on a line. That
 * cost `slot` alone fifty entries of pure parameter noise.
 *
 * ─── THE ALIAS RULE, AND EXACTLY HOW FAR IT REACHES ──────────────────────
 *
 * A local counts as the field when it is BOUND from it in that file:
 * `const|let|var NAME = <anything>.FIELD;` and the `??=` form
 * `const NAME = (owner.FIELD ??= []);`. Mutations of `NAME` anywhere in that file
 * are then the field's.
 *
 * IT IS A NAME WITHIN A FILE AND NOT A SCOPE. A second local of the same name in
 * another function of the same file is counted too, and that is not always wrong
 * here — `sortByInsertion` and `insertOutOfPlaceBack` take the very arrays
 * their caller aliased, under the same names — but it is not a claim the reader
 * can make. What it CANNOT see is the other direction: a field handed to a
 * function in another FILE and mutated there under any name. Nothing in `src`
 * does that; what stands in front of it is the parameter types, which are
 * `readonly` on both halves of the ordered settle.
 *
 * ─── WHAT ELSE THIS CANNOT DO ────────────────────────────────────────────
 *
 *   - `Reflect.set(node, 'atThisKey', v)`, or a field name built at run time.
 *   - `Object.assign(state, { appendedBucketMemberSlots: … })`, and every other library call that
 *     writes a field it is handed by name.
 *   - A destructuring assignment, which reads as a plain read.
 *   - A write whose `=` is on the next line. The reader looks forward within a
 *     line and BACK across one, so `state\n.appendedBucketMemberSlots = x` is seen and
 *     `state.appendedBucketMemberSlots\n= x` is not.
 *   - TWO FIELDS OF THE SAME NAME ON DIFFERENT TYPES, which it merges without a
 *     word. `slots` is the live example: it is the `reset` command's own
 *     `TOIMOrderedListCommand.slots` and the lists the ordered service's free
 *     functions take under the same name, and the entries below are one word
 *     covering them. The same hazard is written up in
 *     `which-side-of-a-slot-owns-which-part.test.ts`.
 *   - Anything outside `packages/core/src`.
 *
 * Files are read as Buffers and decoded with `latin1`, which maps every byte to
 * one code unit and never substitutes or drops one, so string index i is byte i —
 * three files in this package once carried literal NUL bytes, on which BSD grep
 * answers "Binary file X matches" and no content lines at all. Comments and
 * string bodies are blanked to spaces with every position kept, because these
 * fields are discussed in prose far more often than they are touched.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = join(__dirname, '..', 'src');

/* ── reading the tree ──────────────────────────────────────────────────── */

/** EVERY file, not every `.ts` file — an extension filter is a blind spot. */
const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name === 'tests') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile()) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

const relative = (path: string): string => path.slice(SRC.length + 1).split(sep).join('/');

/** Comments and string bodies blanked to spaces, positions and newlines kept. */
const codeOnly = (text: string): string => {
    const out = text.split('');
    let i = 0;
    while (i < text.length) {
        const here = text[i];
        const next = text[i + 1];
        if (here === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') { out[i] = ' '; i++; }
            continue;
        }
        if (here === '/' && next === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                if (text[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < text.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        if (here === '\'' || here === '"' || here === '`') {
            i++;
            while (i < text.length && text[i] !== here) {
                if (text[i] === '\\') { out[i] = ' '; i++; }
                if (i >= text.length) break;
                if (text[i] !== '\n') out[i] = ' ';
                i++;
            }
            i++;
            continue;
        }
        i++;
    }
    return out.join('');
};

type TFile = { path: string; lines: string[] };

const files: TFile[] = sourceFiles().map(path => ({
    path: relative(path),
    lines: codeOnly(readFileSync(path).toString('latin1')).split('\n'),
}));

const fileAt = (path: string): TFile => files.find(file => file.path === path) as TFile;

/* ── which fields, read off the declarations ───────────────────────────── */

/** Four-space indentation is the discriminator for a field of the type's own body. */
const DECLARED_FIELD = /^ {4}(?:public |private |protected )?(?:readonly )?([A-Za-z_$][\w$]*)\??\s*:/gm;
/** A field a class leaves open — `readonly` included, see the header. */
const OPEN_FIELD = /^ {4}public (?:readonly )?([A-Za-z_$][\w$]*)\s*[?!]?\s*[:=]/gm;

const namesIn = (path: string, pattern: RegExp): string[] => {
    const text = fileAt(path).lines.join('\n');
    const found: string[] = [];
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) { found.push(match[1]); match = pattern.exec(text); }
    return found;
};

// THE PREDICATE IS THE NAME, NOT THE FOLDER: `src/engine/types/` held these and
// only these, and it dissolved when the tree was laid out by domain. A path
// prefix would now select nothing and this census would pass on an empty set.
const STRUCT_TYPES = files
    .map(file => file.path)
    .filter(path => (path.split('/').pop() ?? '').startsWith('TOIM'));

/**
 * WHAT THE OTHER THREE CENSUSES OWN, each named with the file that owns it, so
 * that no field has two owners.
 *
 *   - the fifteen fields of a slot — `which-side-of-a-slot-owns-which-part.test.ts`,
 *     which pins them by SIDE. `effects` is the one exception and is added back
 *     below: that file pins who may assign the LIST and nothing pinned who may
 *     change what is IN it, which is `OIMEffect`'s swap-remove writing
 *     `dependents[at] = tail` through a local it took two lines earlier.
 *   - `isSorted` and the deleted `reordered` —
 *     `who-may-say-a-bucket-is-in-order.test.ts`, whose empty pin on the second
 *     is what keeps it deleted.
 *   - the two frame stamps — `what-every-frame-stamp-answers.test.ts`, which
 *     asks more of them than "who writes it": whether each answers one question
 *     or two.
 */
const SLOT_TYPES = [
    'slot/types/TOIMSlot.ts',
    'entity/types/TOIMEntityContentSlot.ts',
    'slot/types/TOIMKeyedSlot.ts',
] as const;

const OWNED_ELSEWHERE = new Set<string>([
    ...SLOT_TYPES.flatMap(path => namesIn(path, DECLARED_FIELD))
        .filter(field => field !== 'effects' && field !== 'effectEdges'),
    'isSorted', 'reordered', 'content',
]);

const FIELDS = [...new Set([
    ...STRUCT_TYPES.flatMap(path => namesIn(path, DECLARED_FIELD)),
    ...files.flatMap(file => namesIn(file.path, OPEN_FIELD)),
])].filter(field => !OWNED_ELSEWHERE.has(field)).sort();

/* ── finding the writes ────────────────────────────────────────────────── */

/** `=` in every assigning spelling, and `==`/`===`/`=>` in none of them. */
const ASSIGN = /^\s*(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?=(?![=>])/;
const INC_AFTER = /^\s*(?:\+\+|--)/;
const INC_BEFORE = /(?:\+\+|--)\s*$/;
/** A mutating call on the container the field holds. */
const CONTAINER = /^\s*\??\.\s*(?:push|pop|shift|unshift|splice|fill|sort|reverse|copyWithin|set|add|delete|clear|addSlot|removeSlot|clearSlots)\s*\(/;
/** `bucketSlotsArrayStore.bucketMemberSlots.length = 0` — emptying it. */
const LENGTH_SET = /^\s*\.\s*length\s*(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?=(?!=)/;
/** `dependents[at] = tail` — a cell of it. */
const INDEX_SET = /^\s*\[[^\]]*\]\s*(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?=(?!=)/;
const DECL_BEFORE = /(?:^|[\s(,{])(?:public|private|protected|readonly|let|const|var)\s+(?:readonly\s+)?$/;

/** `const dependents = holder.effects;`, `const at = (slots.pending ??= []);` and `const store = (slot as T).store;` */
const aliasBinding = (field: string): RegExp => new RegExp(
    String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]*)?=\s*\(?\s*`
    + String.raw`(?:[A-Za-z0-9_$.?\[\]]+\s+as\s+[^;=]*?\)|[A-Za-z0-9_$.?\[\]]*)\.${field}\s*(?:\?\?=|\)?\s*(?:as\b[^;]*)?;)`,
    'g',
);

const wordFor = (name: string): RegExp =>
    new RegExp(String.raw`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`, 'g');

type TKind = 'write' | 'mutate';
const KIND_ORDER: readonly TKind[] = ['write', 'mutate'];

type TSite = { field: string; path: string; line: number; kind: TKind; text: string };

/** What this occurrence does to the field it names, reached through a `.`. */
const onOwner = (before: string, lines: string[], at: number): boolean => {
    const trimmed = before.replace(/\s+$/, '');
    // A wrapped access is still one: the `.` may sit at the end of the line above.
    return trimmed.endsWith('.') || (trimmed === '' && at > 0 && /\.\s*$/.test(lines[at - 1]));
};

const kindOf = (before: string, after: string): TKind | undefined => {
    if (ASSIGN.test(after) || INC_AFTER.test(after) || INC_BEFORE.test(before.replace(/\s+$/, ''))) {
        return 'write';
    }
    if (CONTAINER.test(after) || LENGTH_SET.test(after) || INDEX_SET.test(after)) return 'mutate';
    return undefined;
};

const sites: TSite[] = [];

for (const field of FIELDS) {
    const word = wordFor(field);
    for (const file of files) {
        const aliases = new Set<string>();
        const binding = aliasBinding(field);
        const text = file.lines.join('\n');
        binding.lastIndex = 0;
        let bound = binding.exec(text);
        while (bound !== null) { aliases.add(bound[1]); bound = binding.exec(text); }

        for (let i = 0; i < file.lines.length; i++) {
            const line = file.lines[i];
            word.lastIndex = 0;
            let match = word.exec(line);
            while (match !== null) {
                const before = line.slice(0, match.index);
                const after = line.slice(match.index + field.length);
                const kind = onOwner(before, file.lines, i) ? kindOf(before, after) : undefined;
                if (kind !== undefined) {
                    sites.push({ field, path: file.path, line: i + 1, kind, text: line.trim() });
                }
                match = word.exec(line);
            }
            // AND THE SAME LINE READ AGAIN UNDER EVERY LOCAL BOUND FROM THE FIELD.
            // A declaration is not a mutation, and neither is a field of the same
            // name on something else — `foo.dependents` is not the local.
            for (const name of aliases) {
                const local = wordFor(name);
                local.lastIndex = 0;
                let hit = local.exec(line);
                while (hit !== null) {
                    const before = line.slice(0, hit.index);
                    const after = line.slice(hit.index + name.length);
                    const isField = before.replace(/\s+$/, '').endsWith('.') || DECL_BEFORE.test(before);
                    if (!isField && kindOf(before, after) !== undefined) {
                        sites.push({ field, path: file.path, line: i + 1, kind: 'mutate', text: line.trim() });
                    }
                    hit = local.exec(line);
                }
            }
        }
    }
}

/** Only the fields something actually writes — the rest have no mutator to pin. */
const TOUCHED = new Set(sites.map(site => site.field));

const signatures = (): string[] => {
    const byKey = new Map<string, Map<TKind, number>>();
    for (const site of sites) {
        const key = `${site.field} ${site.path}`;
        const kinds = byKey.get(key) ?? new Map<TKind, number>();
        kinds.set(site.kind, (kinds.get(site.kind) ?? 0) + 1);
        byKey.set(key, kinds);
    }
    return [...byKey.entries()]
        .map(([key, kinds]) => {
            const parts = KIND_ORDER.filter(kind => kinds.has(kind))
                .map(kind => `${kind}×${kinds.get(kind) as number}`);
            return `${key} ${parts.join(' ')}`;
        })
        .sort();
};

/* ── the pin ───────────────────────────────────────────────────────────── */

/**
 * WHO WRITES WHAT. Counts per file and per field, never line numbers: a line
 * number makes every edit above a write a failure, and moving a method within
 * its own file must cost nothing.
 *
 * A NEW LINE HERE IS A SECOND MUTATOR OF SOMETHING, and the question to ask of it
 * is not "does it work" — all three of `value`'s writers worked — but "what does
 * this file know about when it is allowed to write, and what enforces that".
 *
 * `value`, `isDeriving`, `ranAt*` and `checkedAt*` of a computed slot have one
 * writer, `computed/utils/refreshOIMComputedSlot.ts`, called only by the
 * slot's owner.
 *
 * ELEVEN LINES ARRIVED AT ONCE WHEN THE THREE ENTITY CONSTRUCTORS TOOK AN
 * OPTIONS OBJECT, and none of them is a second mutator. Two causes, both worth
 * knowing, because both are about what this reader can SEE rather than about
 * what the engine does:
 *
 *   A PARAMETER PROPERTY IS A WRITE THIS READER CANNOT FIND. `channel`,
 *   `entityColumnOwner`, `columnSlotStoreService` and `writer` were declared in the
 *   constructor's parameter list, so the assignment the compiler emits has no
 *   `this.x =` anywhere in the source and nothing here counted it. They are
 *   ordinary fields assigned in the constructor body now, and the same single
 *   assignment is finally visible. Each is still one, in the constructor, and
 *   nowhere else.
 *
 *   A NEW `TOIM*.ts` WIDENS THE NET, which is exactly what {@link STRUCT_TYPES}
 *   is for. `TOIMEntityCollectionOptions.ts` declares `slotEmptinessPolicy`,
 *   `bucketSlotsService` and `entitySlotStoreService`, so those three joined
 *   the field list and their EXISTING writers — two of them in facades this
 *   change never touched — surfaced with them.
 */
const PINNED: readonly string[] = [
    'addedColumnNames slot/OIMSlotContentChangeListenerService.ts mutate×1',
    'afterEachFlush channel/OIMChannelService.ts mutate×3',
    'afterEachFrame channel/OIMChannelService.ts mutate×6',
    'afterIdleSlotReleaseWheel collector/utils/mintOIMAfterIdleSlotReleaseWheel.ts write×1',
    'afterUnholdSlotReleaseWheel collector/utils/mintOIMAfterUnholdSlotReleaseWheel.ts write×1',
    'afterWriteSlotReleaseWheel collector/utils/mintOIMAfterWriteSlotReleaseWheel.ts write×1',
    'allColumnsListenerCount slot/OIMSlotContentChangeListenerService.ts write×2',
    'rootSlots computed/OIMComputedSlot.ts write×1',
    'rootSlots computed/OIMSourceTrackingComputedValueService.ts write×2',
    'rootSlots computed/utils/getOIMRootSlots.ts write×1',
    'rootSlots effect/OIMEffectService.ts write×2',
    'arrivedBucketMemberSlotChannelQueues bucket/OIMBucketContentService.ts write×1',
    'atThisKey key/OIMKeyTreeWalk.ts write×1',
    'atThisKey store/OIMSlotTreeStoreService.ts write×1',
    'batchChangedColumnsChannelQueue slot/OIMSlotContentChangeDeliveryService.ts write×3',
    'batchDepth slot/OIMSlotContentChangeDeliveryService.ts write×1',
    'batchPatchChannelQueue slot/OIMSlotContentChangeDeliveryService.ts write×3',
    'batchSlotChannelQueue slot/OIMSlotContentChangeDeliveryService.ts write×3',
    'bucketCommands bucket/commands/OIMWholeListBucketCommands.ts write×1',
    'bucketCommands bucket/OIMBucketContentService.ts write×1',
    'bucketMemberSlots bucket/array/OIMBucketMemberSlotsArrayService.ts mutate×13',
    'bucketMemberSlotsArrayService bucket/OIMArrayBucketContentService.ts write×1',
    'bucketSlot bucket/commands/OIMBucketCommandsCursor.ts write×1',
    'bucketSlotsStore bucket/OIMBucketSlot.ts write×1',
    'carrierSlot column/OIMColumnSlot.ts write×1',
    'checkedAtEpoch column/OIMColumnSlot.ts write×1',
    'checkedAtRevision column/OIMColumnSlot.ts write×1',
    'computedValueService column/OIMColumnSlot.ts write×1',
    'isDeriving column/OIMColumnSlot.ts write×1',
    'ranAtEpoch column/OIMColumnSlot.ts write×1',
    'ranAtRevision column/OIMColumnSlot.ts write×1',
    'rootSlots column/OIMColumnSlot.ts write×1',
    'sourceComputeds column/OIMColumnSlot.ts write×1',
    'sourceSlots column/OIMColumnSlot.ts write×1',
    'sourceTracker column/OIMColumnSlot.ts write×1',
    'changedColumnNames entity/OIMEntityContentService.ts write×1 mutate×1',
    'checkedAtEpoch computed/OIMComputedSlot.ts write×1',
    'checkedAtEpoch computed/utils/refreshOIMComputedSlot.ts write×2',
    'checkedAtRevision computed/OIMComputedSlot.ts write×1',
    'checkedAtRevision computed/utils/refreshOIMComputedSlot.ts write×2',
    'childNodes key/OIMKeyTreeWalk.ts write×1 mutate×2',
    'cleanup effect/OIMEffectService.ts write×2',
    'collectorSlot db/OIMDB.ts write×1',
    'columnGroupsByEdge effect/OIMEffectService.ts write×2',
    'columnListenerCountsByColumnName slot/OIMSlotContentChangeListenerService.ts write×1 mutate×3',
    'columnSlotOwner column/OIMColumnSlotService.ts write×1',
    'columnSlotOwner slot/OIMSlotOwnerService.ts write×1',
    'columnSlotService slot/OIMSingleSlotService.ts write×1',
    'columnSlotService slot/OIMSlotOwnerService.ts write×1',
    'columnSlotService slot/OIMSlotCollectionService.ts write×1',
    'columnSlotStoreService column/OIMColumnSlotOwner.ts write×1 mutate×2',
    'columnSlotStoreService db/OIMDefaults.ts write×1',
    'commands bucket/OIMBucketCommands.ts write×1 mutate×4',
    'commands bucket/OIMBucketSlot.ts write×1',
    'commandsBucketSlotChannelQueue bucket/OIMBucketCommands.ts write×1',
    'commandsStartedAtEpoch bucket/OIMBucketCommands.ts write×1',
    'commandsStartedAtEpoch bucket/OIMBucketSlot.ts write×1',
    'commandsStartedAtRevision bucket/OIMBucketCommands.ts write×1',
    'commandsStartedAtRevision bucket/OIMBucketSlot.ts write×1',
    'commandsStoreSlotChannelQueue bucket/OIMBucketCommands.ts write×1',
    'computedColumnSlotStoreService db/OIMDefaults.ts write×1',
    'computedValueService computed/OIMComputedSlot.ts write×1',
    'computedValueService computed/OIMComputedContentService.ts write×1',
    'contentChangeListener bucket/OIMCollectionSetBucketContentService.ts write×2',
    'contentChangeListenerReadColumns slot/OIMSlotContentChangeListenerService.ts write×1 mutate×1',
    'contentChangeListeners slot/OIMSlotContentChangeListenerService.ts write×1 mutate×2',
    'createSources computed/OIMExplicitSourceComputedContentService.ts write×1',
    'createSources computed/utils/attachOIMComputedDerivation.ts write×1',
    'defaultChannelSlot db/OIMDB.ts write×1',
    'departedBucketMemberSlotChannelQueues bucket/OIMBucketContentService.ts write×3',
    'derive computed/OIMComputedValueService.ts write×1',
    'derive computed/utils/attachOIMComputedDerivation.ts write×1',
    'dropped channel/OIMChannelService.ts write×1',
    'effectEdges slot/OIMSlot.ts write×1',
    'effectEdges slot/OIMSlotOwner.ts write×1 mutate×2',
    'effectFlags effect/OIMEffectService.ts write×4',
    'effects slot/OIMSlot.ts write×1',
    'effects slot/OIMSlotOwner.ts write×1 mutate×3',
    'entitySlotEmptinessPolicy db/OIMDefaults.ts write×1',
    'entityWriter db/OIMDefaults.ts write×1',
    'entityWriter entity/OIMEntityContentService.ts write×1',
    'epoch channel/OIMChannelService.ts write×1',
    'errorPolicy collector/OIMSlotWheel.ts write×1',
    'flushRequested channel/OIMChannelService.ts write×4',
    'freePositions index/OIMReclaimingIndexKeysService.ts mutate×2',
    'getNowMs collector/OIMSlotWheel.ts write×1',
    'getReleaseDueMs collector/OIMSlotReleaseWheel.ts write×1',
    'indexKeys bucket/OIMBucketSlot.ts write×1',
    'indexKeys computed/OIMComputedSlot.ts write×1',
    'indexKeys entity/OIMEntitySlot.ts write×1',
    'indexKeys index/OIMIndexKeysService.ts write×1 mutate×3',
    'indexKeys index/OIMReclaimingIndexKeysService.ts mutate×1',
    'indexKeysPosition index/OIMSlotCollectionIndexService.ts write×1',
    'indexKeysService db/OIMDefaults.ts write×1',
    'indexKeysService index/OIMSlotCollectionIndexService.ts write×1 mutate×3',
    'initialValue computed/OIMComputedContentService.ts write×1',
    'isAnyColumnAdded slot/OIMSlotContentChangeListenerService.ts write×1',
    'isDeriving computed/OIMComputedSlot.ts write×1',
    'isDeriving computed/utils/refreshOIMComputedSlot.ts write×2',
    'isDisposed index/OIMSlotCollectionIndexService.ts write×1',
    'isFlushing channel/OIMChannelService.ts write×2',
    'isFlushing collector/OIMUnusedSlotCollectorService.ts write×2',
    'isRunning channel/OIMChannelService.ts write×2',
    'isWholeListRecorded bucket/OIMBucketCommands.ts write×3',
    'isWholeListRecorded bucket/OIMBucketSlot.ts write×1',
    'keepAfterIdleMs collector/OIMSlotAfterIdleReleasePolicy.ts write×1',
    'keepAfterUnholdMs collector/OIMSlotAfterUnholdReleasePolicy.ts write×1',
    'keepAfterWriteMs collector/OIMSlotAfterWriteReleasePolicy.ts write×1',
    'keyOf index/OIMSlotCollectionIndexService.ts write×1',
    'maxCommandsPerSlot bucket/OIMBucketCommands.ts write×1',
    'nextPosition index/OIMAppendingIndexKeysService.ts write×1',
    'nextPosition index/OIMReclaimingIndexKeysService.ts write×1',
    'onError error/OIMLogAndContinueErrorPolicy.ts write×1',
    'openDepth collector/OIMUnusedSlotCollectorService.ts write×2',
    'openedAtEpoch channel/OIMChannelService.ts write×2',
    'openedAtRevision channel/OIMChannelService.ts write×2',
    'positionInFirstSubscribedSlot effect/OIMEffectService.ts write×1',
    'positionsInOtherSubscribedSlots effect/OIMEffectService.ts write×1 mutate×1',
    'ranAtEpoch computed/OIMComputedSlot.ts write×1',
    'ranAtEpoch computed/utils/refreshOIMComputedSlot.ts write×1',
    'ranAtEpoch effect/OIMEffectService.ts write×1',
    'ranAtRevision computed/OIMComputedSlot.ts write×1',
    'ranAtRevision computed/utils/refreshOIMComputedSlot.ts write×1',
    'ranAtRevision effect/OIMEffectService.ts write×1',
    'releaseScheduledSlotFlag collector/OIMSlotReleaseWheel.ts write×1',
    'releaseValue computed/OIMComputedValueService.ts write×1',
    'releasesWrittenSlots collector/OIMSlotEarliestReleasePolicy.ts write×1',
    'releasesWrittenSlots slot/OIMSlotOwnerService.ts write×1',
    'removedAtChannelQueues bucket/OIMBucketContentService.ts write×1',
    'requestedKeys index/OIMSlotCollectionIndexService.ts write×2',
    'revision channel/OIMChannelService.ts write×2',
    'sameValueGuard computed/OIMComputedValueService.ts write×1',
    'scheduledCallback schedule/OIMFlushSchedulerService.ts write×4',
    'schedulesReleaseOnWrite collector/OIMSlotEarliestReleasePolicy.ts write×1',
    'schedulesReleaseOnWrite slot/OIMSlotOwnerService.ts write×1',
    'schemas db/OIMDB.ts write×1',
    'setReleaseDueMs collector/OIMSlotReleaseWheel.ts write×1',
    'settlesWrittenSlots slot/OIMSlotOwnerService.ts write×1',
    'slot store/OIMSingleSlotStoreService.ts write×2',
    'slotContentChangeListenerReadColumns bucket/OIMCollectionSetBucketContentService.ts write×2',
    'slotContentChangeListenerReadColumns index/OIMSlotCollectionIndexService.ts write×1',
    'slotContentService slot/OIMSingleSlotService.ts write×1',
    'slotContentService slot/OIMSlotCollectionService.ts write×1',
    'slotContentService slot/OIMSlotOwnerService.ts write×1',
    'slotReleaseListeners db/OIMDB.ts mutate×2',
    'slotEmptinessPolicy entity/OIMEntityContentService.ts write×1',
    'slotFilingService slot/OIMSlotOwnerService.ts write×1 mutate×2',
    'slotRefetchListener collector/OIMSlotRefetchWheel.ts write×1',
    'slotReleaseDueFramePolicy collector/OIMSlotAfterWriteReleasePolicy.ts write×1',
    'slotReleasePolicy db/OIMDefaults.ts write×1',
    'slotReleasePolicy slot/OIMSlotOwnerService.ts write×1',
    'slotStamp db/OIMDefaults.ts write×1',
    'slotStamp slot/OIMSlotOwnerService.ts write×1',
    'slotStoreService slot/OIMSingleSlotService.ts write×1',
    'slotStoreService slot/OIMSlotCollectionService.ts write×1',
    'slotSubscriptionListener slot/OIMSlotOwner.ts write×1',
    'slots store/OIMSlotTreeStoreService.ts mutate×3',
    'sortedCount bucket/array/OIMBucketMemberSlotsArrayService.ts write×7',
    'sourceComputeds computed/OIMComputedSlot.ts write×1',
    'sourceComputeds computed/OIMExplicitSourceComputedContentService.ts write×1',
    'sourceComputeds computed/OIMSourceTrackingComputedValueService.ts write×1',
    'sourceComputeds effect/OIMEffectService.ts write×2',
    'sourceSlotCollectionService index/OIMSlotCollectionIndexService.ts write×1',
    'sourceSlots computed/OIMComputedSlot.ts write×1',
    'sourceSlots computed/OIMExplicitSourceComputedContentService.ts write×1',
    'sourceSlots computed/OIMSourceTrackingComputedValueService.ts write×1',
    'sourceSlots effect/OIMEffectService.ts write×2',
    'sourceStoreSlot bucket/OIMSlotCollectionBucketService.ts write×1',
    'sourceTracker computed/OIMComputedSlot.ts write×1',
    'sourceTracker computed/utils/swapOIMActiveSourceTracker.ts write×1',
    'collectionBucketSlot bucket/OIMSlotCollectionBucketService.ts write×1',
    'storeSlotListener db/OIMDefaults.ts write×1',
    'storeSlotListener slot/OIMSingleSlotService.ts write×1',
    'storeSlotListener slot/OIMSlotCollectionService.ts write×1',
    'timer collector/OIMSlotWheel.ts write×1',
    'timerDisposer schedule/OIMFlushSchedulerService.ts write×3 mutate×1',
    'writeDepth bucket/OIMBucketContentService.ts write×6',
];

/**
 * THE WHOLE NET, and this list is the one that makes a SIXTH struct type or a new
 * open field on a class impossible to add in silence. It is read off the
 * declarations, so a field arriving anywhere as a new `TOIM*.ts` or as a
 * `public` field lands here whether or not anything writes it yet — which is a
 * failure with the field's name in it, one line before its first writer arrives.
 */
const PINNED_FIELDS: readonly string[] = [
    'afterEachFlush', 'addedColumnNames', 'afterEachFrame', 'afterEachFrameHandlerChannelQueue', 'afterIdleSlotReleaseWheel',
    'afterUnholdSlotReleaseWheel', 'afterWriteSlotReleaseWheel', 'allColumnsListenerCount', 'rootSlots',
    'arrivedBucketMemberSlotChannelQueues', 'atThisKey', 'batchChangedColumnsChannelQueue',
    'batchDepth', 'batchPatchChannelQueue', 'batchSlotChannelQueue', 'body', 'bucketCollectionService',
    'bucketCommands', 'bucketMemberSlots', 'bucketMemberSlotsArrayService', 'bucketSlot',
    'bucketSlotsStore', 'carrierSlot', 'changedColumnNames', 'channelScheduler', 'channelSlot', 'checkedAtEpoch',
    'checkedAtRevision', 'childNodes', 'cleanup', 'clock', 'collectionBucketSlot', 'collectorSlot', 'columnGroupsByEdge',
    'columnGroups', 'columnListenerCountsByColumnName', 'columnName', 'columnNames',
    'columnSlotOwner', 'columnSlotOwnerOptions',
    'columnSlotService', 'columnSlotStoreService', 'columns', 'commands', 'commandsBucketSlotChannelQueue',
    'commandsStartedAtEpoch', 'commandsStartedAtRevision', 'commandsStoreSlotChannelQueue', 'comparator', 'createSchemas',
    'computedColumnSlotStoreService',
    'computedValueService', 'contentChangeListener',
    'contentChangeListenerReadColumns', 'contentChangeListeners', 'createColumnSlotOwner', 'createSources', 'declaredColumnNames',
    'defaultChannelSlot', 'defaults', 'departedBucketMemberSlotChannelQueues', 'derive', 'direction', 'dropped',
    'effectChannelQueue', 'effectEdges', 'effectFlags', 'effectService', 'effects', 'entityInserter',
    'entityService', 'entitySlotEmptinessPolicy', 'entityWriter', 'epoch', 'errorPolicy', 'flushRequested',
    'frame', 'freePositions', 'getNowMs', 'getReleaseDueMs', 'indexKeys', 'indexKeysPosition',
    'indexKeysPositions', 'indexKeysService', 'indexService', 'initialValue',     'isDeriving', 'isAnyColumnAdded', 'isDisposed', 'isFlushing', 'isRunning', 'isWholeListRecorded', 'keepAfterIdleMs',
    'keepAfterUnholdMs', 'keepAfterWriteMs', 'keyOf', 'maxCommandsPerSlot',
    'nextPosition', 'onBeforeFlush', 'onError', 'openDepth', 'openedAtEpoch', 'openedAtRevision',
    'patchEntityColumn', 'patchEntityColumns', 'positionInFirstSubscribedSlot', 'positionsInOtherSubscribedSlots',
    'putEntityColumns', 'ranAtEpoch', 'ranAtRevision', 'releaseScheduledSlotFlag', 'releaseTimer', 'releaseValue',
    'releasesWrittenSlots', 'removedAtChannelQueues', 'requestedKeys', 'revision', 'rootCompositeKeyNode',
    'sameValueGuard', 'scheduledCallback', 'schedulesReleaseOnWrite', 'schemas', 'setReleaseDueMs', 'settlesWrittenSlots',
    'slot', 'slotContentChangeListenerReadColumns', 'slotContentService', 'slotEmptinessPolicy', 'slotFilingService', 'slotRefetchListener',
    'slotReleaseDueFramePolicy', 'slotReleasePolicy', 'slotService', 'slotReleaseListeners', 'slotStamp', 'slotStoreService',
    'slotSubscriptionListener', 'slotWheelOptions', 'slots', 'sortColumns', 'sortedCount', 'sourceComputeds',
    'sourceSlotCollectionService', 'sourceSlots', 'sourceStoreSlot', 'sourceTracker', 'store', 'storeSlotListener',
    'timer', 'timerDisposer', 'uniqueBucketMemberSlots', 'unusedSlotChannelQueue', 'unusedSlotCollectorSlot',
    'value', 'writeDepth',
];

/** The whole pin, in the exact form a line is pasted back as. */
const printTable = (): void => {
    console.error(
        '\n─── PINNED, as the tree stands — paste it back ───\n'
        + `${signatures().map(entry => `    '${entry}',`).join('\n')}\n`,
    );
};

/* ── the assertions ────────────────────────────────────────────────────── */

describe('a write through a local is still a write', () => {
    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some(file => file.path === 'computed/utils/refreshOIMComputedSlot.ts')).toBe(true);
        // Comments were blanked and code was not: `createOIMAutoIndex`
        // discusses `OIMComputed.value` in prose four times over and writes it
        // never, which a reader counting prose would report as four writers.
        expect(sites.filter(site => site.path === 'factories/createOIMAutoIndex.ts')).toEqual([]);
    });

    /**
     * THE NET ITSELF. Everything below is keyed on this list, so a field that
     * never enters it is checked by nothing — which is exactly how
     * `OIMComputed.value` kept three writers under a header claiming one.
     */
    it('watches every field the declarations under src yield', () => {
        expect(FIELDS).toEqual([...PINNED_FIELDS].sort());
    });

    /**
     * THE ONE. Every write and every mutation of every watched field, per file,
     * against the list we agreed on — in both directions, so a writer that goes
     * away has to be struck from the pin in the same change.
     */
    it('every field is written from exactly the files, and as often, as pinned', () => {
        const found = signatures();
        const pinned = [...PINNED].sort();
        const drift = found.join('\n') === pinned.join('\n')
            ? ''
            : `pinned:\n${pinned.join('\n')}\n\nfound:\n${found.join('\n')}\n\nsites:\n${
                sites.map(site => `    ${site.path}:${site.line} ${site.field} ${site.kind} — ${site.text}`)
                    .sort().join('\n')}`;
        if (drift !== '') printTable();
        expect(drift).toBe('');
    });

    it('every field on the pin is one something still writes', () => {
        const gone = [...new Set(PINNED.map(entry => entry.slice(0, entry.indexOf(' '))))]
            .filter(field => !TOUCHED.has(field))
            .sort();
        expect(gone).toEqual([]);
    });

    /**
     * A DERIVATION'S VALUE IS THE DERIVATION'S, and this is the case that would
     * have fired. It is named separately from the table above so that the failure
     * says which rule broke rather than printing forty lines of counts.
     */
    it('the value of a derivation is written by refreshOIMComputedSlot, and a push column caches its value through its owner alone', () => {
        const writers = files
            .filter(file => file.path.startsWith('computed/') || file.path.startsWith('column/'))
            .filter(file => /(?<!this)\.content\s*=(?![=>])/.test(file.lines.join('\n')))
            .map(file => file.path);
        expect(writers).toEqual(['column/OIMPushColumnSlotOwner.ts', 'computed/utils/refreshOIMComputedSlot.ts']);
    });

    /**
     * AND THE ALIAS MACHINERY IS ALIVE, pinned by the TEXT of the sites only it
     * can reach — the swap-remove and the push in `OIMSlotOwner`, none of
     * which names `effects` at all. Without this, the reader breaking is
     * indistinguishable from the engine getting tidier: every count above falls,
     * somebody lowers the pin.
     */
    it('sees a list mutated through a local it was taken into', () => {
        const throughLocals = sites
            .filter(site => site.field === 'effects' && site.kind === 'mutate')
            .map(site => site.text)
            .sort();
        expect(throughLocals).toEqual([
            'subscribers.pop();',
            'subscribers.push(effect);',
            'subscribers[positionInSlot] = tailEffect;',
        ]);
    });
});
