import { oimInsertEntityWithCopy } from '../src/engine/entity/utils/oimInsertEntityWithCopy';
import type { TOIMSlotEditable } from '../src/engine/slot/types/TOIMSlotEditable';
/**
 * A slot is one plain struct six subsystems reach into, and each of them can be
 * right on its own: `slot.entity` was assigned at six correct sites and the
 * defect existed only in the sum. So what is pinned is not "one owner per field"
 * but WHICH SIDE OWNS WHICH PART, sides disjoint and their union closed over
 * every writer — a per-field census stays green while a file already allowed to
 * write a field starts writing it on another side's behalf.
 *
 *   VALUE         the row's own record.
 *   HOLD          every reference nothing else records, and the dependents list.
 *   FRAME         what this identity owes its dependents: the stamps, the clock
 *                 reading, and the per-column identities of a field subscription.
 *   FILING        the name it is filed under, who may let it go, whether it has.
 *   REGISTRATION  the per-ordinal storage a consumer claims on the carrier.
 *   CONDEMNATION  how old a value is — a millisecond, which cannot be subtracted
 *                 from a frame number, which is why it is not FRAME.
 *
 * Nothing shells out: BSD grep goes blind on a file containing a NUL byte, which
 * this package has had, and `latin1` makes string index i byte i.
 *
 * It will MISS a write through a local (`OIMColumnOwner.mintUnfiledColumnSlot` fills a
 * store it took into one), a `Reflect.set`, a destructuring assignment, and a
 * write whose `=` is on the next line — the reader looks forward within a line
 * and back across one. It also keys on the NAME, so same-named fields on
 * different objects merge in silence.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { IOIMEntityWriter, TOIMEntitySlot } from '../src/index';
import type { TOIMEntityColumnName } from '../src/engine/entity/types/TOIMEntityColumnName';
import type { TOIMColumnSlot } from '../src/engine/column/types/TOIMColumnSlot';
import {
    OIMDB,
    createOIMEntityService,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    oimIsSlotReleased,
} from '../src/index';

const SRC = join(__dirname, '..', 'src');

const IN_PLACE_STRATEGY = 'factories/createOIMEntityWriterInPlace.ts';

/* ── reading the tree ──────────────────────────────────────────────────── */

/** EVERY file, not every `.ts` file: a write must not leave by moving into a `.mts`. */
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

/** Blanked to spaces with every byte position kept, so a reported site is the line a reader finds the code on. */
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
                // The escape and whatever it escapes go together, so a `\'` does
                // not end the string.
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

type TFile = { path: string; raw: string; lines: string[] };

const files: TFile[] = sourceFiles().map(path => {
    // Nothing is normalised: a CR cannot shift a column because it occupies one.
    const raw = readFileSync(path).toString('latin1');
    return { path: relative(path), raw, lines: codeOnly(raw).split('\n') };
});

const fileAt = (path: string): TFile => files.find(file => file.path === path) as TFile;

/* ── what a slot's fields ARE, read off the types ──────────────────────── */

/** Four-space indentation is what keeps a nested object type's fields out of the slot's. */
const SLOT_TYPES = [
    'engine/slot/types/TOIMSlot.ts',
    'engine/entity/types/TOIMEntitySlot.ts',
    'engine/slot/types/TOIMKeyedSlot.ts',
    'engine/slot/types/TOIMIndexableSlot.ts',
] as const;

const FIELD_LINE = /^ {4}(?:readonly )?([A-Za-z_$][\w$]*)\??\s*:/gm;

const fieldsOf = (path: string): string[] => {
    const text = fileAt(path).lines.join('\n');
    const found: string[] = [];
    FIELD_LINE.lastIndex = 0;
    let match = FIELD_LINE.exec(text);
    while (match !== null) { found.push(match[1]); match = FIELD_LINE.exec(text); }
    return found;
};

const FIELDS = [...new Set(SLOT_TYPES.flatMap(fieldsOf))].sort();

/* ── finding the writes ────────────────────────────────────────────────── */

const ASSIGN = /^\s*(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?=(?!=)/;
const INC_AFTER = /^\s*(?:\+\+|--)/;
const INC_BEFORE = /(?:\+\+|--)\s*$/;
const MUTATOR = /^\s*\??\.\s*(?:push|pop|shift|unshift|splice|fill|sort|reverse|set|add|delete|clear)\s*\(/;
const LENGTH_SET = /^\s*\.\s*length\s*=(?!=)/;
const INDEX_SET = /^\s*\[[^\]]*\]\s*(?:\?\?|\|\||&&)?=(?!=)/;
const DECL_BEFORE = /(?:^|[\s(,{])(?:public|private|protected|readonly|let|const|var)\s+(?:readonly\s+)?$/;
const DECL_AFTER = /^\s*\??\s*:/;

type TSite = { field: string; path: string; line: number; text: string };

const writes: TSite[] = [];

for (const field of FIELDS) {
    const word = new RegExp(String.raw`(?<![A-Za-z0-9_$])${field}(?![A-Za-z0-9_$])`, 'g');
    const bracket = new RegExp(
        String.raw`\[\s*(['"])${field}\1\s*\]\s*(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?=(?!=)`,
        'g',
    );
    for (const file of files) {
        for (let i = 0; i < file.lines.length; i++) {
            const line = file.lines[i];
            word.lastIndex = 0;
            let match = word.exec(line);
            while (match !== null) {
                const raw = line.slice(0, match.index);
                const before = raw.replace(/\s+$/, '');
                const after = line.slice(match.index + field.length);
                // The `.` may sit at the end of the previous line — a wrapped
                // slot access is still one.
                const onOwner = before.endsWith('.')
                    || (before === '' && i > 0 && /\.\s*$/.test(file.lines[i - 1]));
                const declared = DECL_BEFORE.test(raw) || (!onOwner && DECL_AFTER.test(after));
                const written = onOwner && !declared && (
                    ASSIGN.test(after) || INC_AFTER.test(after) || INC_BEFORE.test(before)
                    || MUTATOR.test(after) || LENGTH_SET.test(after) || INDEX_SET.test(after)
                );
                if (written) writes.push({ field, path: file.path, line: i + 1, text: line.trim() });
                match = word.exec(line);
            }
        }
        bracket.lastIndex = 0;
        let bracketed = bracket.exec(file.raw);
        while (bracketed !== null) {
            writes.push({
                field,
                path: file.path,
                line: file.raw.slice(0, bracketed.index).split('\n').length,
                text: file.raw.slice(bracketed.index, bracketed.index + 60).split('\n')[0].trim(),
            });
            bracketed = bracket.exec(file.raw);
        }
    }
}

const signatureOf = (path: string): string => {
    const counts = new Map<string, number>();
    for (const site of writes.filter(write => write.path === path)) {
        counts.set(site.field, (counts.get(site.field) ?? 0) + 1);
    }
    const parts = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([field, n]) => `${field}×${n}`);
    return `${path} ${parts.join(' ')}`;
};

const writerFiles = [...new Set(writes.map(write => write.path))].sort();

/* ── the pin ───────────────────────────────────────────────────────────── */

/**
 * Counts, never line numbers: a line number makes every edit above a write a
 * failure. The question to ask of a new entry is not "does it work" — all six of
 * the original `entity` sites worked — but "which side is this, and would the
 * other five have been allowed to write it".
 */
const SIDES: Record<string, readonly string[]> = {
    /** `createOIMEntityWriterInPlace` is absent because it writes the record's fields and never the field holding it. */
    value: [
        'engine/entity/utils/oimClearEntity.ts entity×1',
        'engine/entity/utils/oimInsertEntityWithCopy.ts entity×1',
        'engine/entity/utils/oimInsertEntityWithSanitizedCopy.ts entity×1',
        'engine/entity/utils/oimInsertEntityWithoutCopy.ts entity×1',
        'factories/createOIMEntityWriterReplacing.ts entity×2',
    ],
    /**
     * `holdCount` summarises nothing, which is why the field exists: a caller
     * that resolved a key leaves no trace in a bucket or in a tree node. A
     * second writer would owe the condition at {@link TOIMSlot.holdCount} — a
     * `++` latched by a structure and a `--` beside the line that drops it.
     */
    hold: [
        'engine/slot/OIMSlotOwner.ts effectEdges×1 effects×1 holdCount×2',
    ],
    /**
     * `OIMChannelService.writeWithoutFlushCheck` stamps a bare struct it was handed without knowing
     * which kind it is, which is why it is pinned; `oimRefreshComputedSlot`
     * stamps the computed slot its owner hands it. A third file writing either
     * is the event this makes loud.
     */
    frame: [
        'engine/channel/OIMChannelService.ts changedAtEpoch×1 changedAtRevision×1',
        'engine/computed/utils/oimRefreshComputedSlot.ts changedAtEpoch×1 changedAtRevision×1',
    ],
    /**
     * `OIMSlotStoreServiceTreeDriven` NORMALISES a key rather than only filing
     * it: a chain key is copied on the way in, because a caller mutating the
     * array they passed would rename a filed identity. `OIMColumnOwner`'s
     * `columnSlotStore×2` is the mint-and-drop pair, and this line is its only
     * enforcement — the field is bare on a shared struct.
     */
    filing: [
        'engine/slot/OIMSlotOwnerService.ts slotFlags×2',
        'engine/slot/utils/oimMarkSlotReleased.ts slotFlags×1',
        'engine/column/OIMColumnOwner.ts columnSlotStore×2',
    ],
    registration: [
        'engine/index/OIMIndexKeysService.ts indexKeys×1',
    ],
    condemnation: [
        'engine/slot/utils/oimSetReleaseDueAfterWriteMs.ts releaseDueAfterWriteMs×1',
        'engine/slot/utils/oimSetReleaseDueAfterIdleMs.ts releaseDueAfterIdleMs×1',
        'engine/slot/utils/oimSetReleaseDueAfterUnholdMs.ts releaseDueAfterUnholdMs×1',
    ],
};

const EXEMPT: readonly string[] = [];

const sideNames = Object.keys(SIDES).sort();
const filesOf = (entries: readonly string[]): string[] =>
    entries.map(entry => entry.slice(0, entry.indexOf(' '))).sort();

/* ── the assertions ────────────────────────────────────────────────────── */

describe('which side of a slot owns which part', () => {
    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        // Two is what the code does; the prose in that file mentions it more often.
        expect(writes.filter(write => write.path === 'factories/createOIMEntityWriterReplacing.ts').length).toBe(2);
    });

    it('a slot has the sixteen fields the four types declare', () => {
        expect(FIELDS).toEqual([
            'changedAtEpoch', 'changedAtRevision', 'columnSlotStore',
            'data', 'effectEdges', 'effects', 'entity', 'holdCount', 'indexKeys',
            'key', 'owner', 'releaseDueAfterIdleMs', 'releaseDueAfterUnholdMs', 'releaseDueAfterWriteMs', 'slotFlags',
            'storeSlot',
        ]);
        // `[,:]` because two of them are shorthand (`key,` and `owner,`), which
        // is a spelling and not a difference: both put the name in the literal.
        const minted = fileAt('engine/entity/utils/createOIMEntitySlot.ts').lines.join('\n');
        for (const field of FIELDS) {
            expect({ field, minted: new RegExp(String.raw`^ {8}${field}\s*[,:]`, 'm').test(minted) })
                .toEqual({ field, minted: true });
        }
    });

    it.each([...FIELDS])('every write of %s comes from a file we put on a side', field => {
        const pinned = [...Object.values(SIDES).flat(), ...EXEMPT]
            .filter(entry => new RegExp(String.raw`\s${field}×\d+(\s|$)`).test(entry))
            .map(entry => entry.slice(0, entry.indexOf(' ')))
            .sort();
        const found = [...new Set(writes.filter(write => write.field === field).map(w => w.path))].sort();
        expect({ field, found }).toEqual({ field, found: pinned });
    });

    it('each file writes exactly the parts, and as many of them, as pinned', () => {
        const pinned = [...Object.values(SIDES).flat(), ...EXEMPT].sort();
        const found = writerFiles.map(signatureOf).sort();
        const drift = found.join('\n') === pinned.join('\n')
            ? ''
            : `pinned:\n${pinned.join('\n')}\n\nfound:\n${found.join('\n')}\n\nsites:\n${
                writes.map(w => `    ${w.path}:${w.line} ${w.field} — ${w.text}`).join('\n')}`;
        expect(drift).toBe('');
    });

    it.each(sideNames.flatMap((a, i) => sideNames.slice(i + 1).map((b): [string, string] => [a, b])))(
        '%s and %s share no file',
        (a: string, b: string) => {
            const left = new Set(filesOf(SIDES[a]));
            const both = filesOf(SIDES[b]).filter(path => left.has(path));
            expect({ a, b, both }).toEqual({ a, b, both: [] });
        },
    );

    /** Without this a field belonging to no side is checked by nothing and can be mutated from anywhere. */
    it('every file that writes any part of a slot is on a side, or named exempt', () => {
        const accounted = new Set([...Object.values(SIDES).flat(), ...EXEMPT]
            .map(entry => entry.slice(0, entry.indexOf(' '))));
        const orphans = writerFiles.filter(path => !accounted.has(path))
            .map(path => `${signatureOf(path)} — on no side. Put it on one, or name it in EXEMPT `
                + 'with the reason it is neither.');
        expect(orphans).toEqual([]);
    });

    it('every file on a side still writes the part it was put there for', () => {
        const found = new Set(writerFiles);
        const gone = [...Object.values(SIDES).flat(), ...EXEMPT]
            .map(entry => entry.slice(0, entry.indexOf(' ')))
            .filter(path => !found.has(path))
            .sort();
        expect(gone).toEqual([]);
    });

    /** A reference write here contradicts the strategy's name silently: the symptom is a `React.memo`d reader re-rendering. */
    it('the in-place strategy writes no reference at all', () => {
        // The path is asserted to exist first: `not.toContain` passes on a string
        // that could never be in the list, so a stale path disarms the case.
        expect(existsSync(join(SRC, IN_PLACE_STRATEGY))).toBe(true);
        expect(writes.map(write => write.path)).not.toContain(IN_PLACE_STRATEGY);
    });

    it('only the index whose cells they are calls the index keys service', () => {
        const callers = files
            .filter(file => /indexKeysService\.(get|set|createPositions|allocatePosition|releasePosition)\b/
                .test(file.lines.join('\n')))
            .map(file => file.path)
            .sort();
        expect(callers).toEqual([
            'facade/index/OIMIndexService.ts',
        ]);
    });
});

describe('a population writes its rows through the strategy it was given', () => {
    type TRow = { id: string; n: number };

    const recorded = (base: IOIMEntityWriter): [IOIMEntityWriter, string[]] => {
        const calls: string[] = [];
        return [{
            ...base,
            fillEntity: (slot, item) => { calls.push('fillEntity'); base.fillEntity(slot, item); },
            putEntity: (slot, entity, changedColumnNames) => { calls.push('putEntity'); return base.putEntity(slot, entity, changedColumnNames); },
            patchEntity: (slot, patch, changedColumnNames) => { calls.push('patchEntity'); return base.patchEntity(slot, patch, changedColumnNames); },
            patchColumn: (slot, columnName, value, changedColumnNames) => {
                calls.push('patchColumn');
                return base.patchColumn(slot, columnName, value, changedColumnNames);
            },
            deleteColumns: (slot, names) => { calls.push('deleteColumns'); return base.deleteColumns(slot, names); },
            clearEntity: slot => { calls.push('clearEntity'); base.clearEntity(slot); },
        }, calls];
    };

    const collectionOver = (write: IOIMEntityWriter) => {
        const db = new OIMDB();
        const rowCollectionService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, string>(db, {
            keyOf: row => row.id,
            entityWriter: write,
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
        });
        const rowEntityService = {
            upsertEntity: (storeSlot: TRowStoreSlot, row: TRow) => rowCollectionService.slotContentService.upsertEntity(storeSlot, row),
            updateEntityByKey: (storeSlot: TRowStoreSlot, key: string, patch: Partial<TRow>) => {
                const slot = rowCollectionService.findSlotByKey(storeSlot, key);
                if (slot !== undefined) rowCollectionService.slotContentService.updateEntity(slot, patch);
            },
            deleteEntity: (slot: TOIMEntitySlot<TRow, string>) => rowCollectionService.slotContentService.deleteEntity(slot),
            getSlotByKey: (storeSlot: TRowStoreSlot, key: string) => rowCollectionService.getSlotByKey(storeSlot, key),
            getSlotCount: (storeSlot: TRowStoreSlot) => rowCollectionService.getSlotCount(storeSlot),
        };
        type TRowStoreSlot = ReturnType<typeof rowCollectionService.createStoreSlot>;
        return [rowEntityService, rowCollectionService.createStoreSlot(db), db] as const;
    };

    it.each<[string, IOIMEntityWriter]>([
        ['createOIMEntityWriterInPlace', createOIMEntityWriterInPlace()],
        ['createOIMEntityWriterReplacing', createOIMEntityWriterReplacing()],
    ])('routes an insert and a removal through %s', (_name, base) => {
        const [write, calls] = recorded(base);
        const [rowEntityService, rows, channel] = collectionOver(write);

        rowEntityService.upsertEntity(rows, { id: 'r1', n: 1 });
        channel.flush();
        expect(calls).toEqual(['fillEntity']);

        rowEntityService.updateEntityByKey(rows, 'r1', { n: 2 });
        channel.flush();
        expect(calls).toEqual(['fillEntity', 'patchEntity']);

        const slot: TOIMEntitySlot<TRow, string> = rowEntityService.getSlotByKey(rows, 'r1');
        rowEntityService.deleteEntity(slot);
        channel.flush();
        expect(calls).toEqual(['fillEntity', 'patchEntity', 'clearEntity']);
        // Nothing here holds the slot, so this asks whether the collection let
        // the identity go — the stronger question than "is the value undefined".
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(rowEntityService.getSlotCount(rows)).toBe(0);
    });

    it('lets the strategy decide what a first value is', () => {
        const freezing: IOIMEntityWriter = {
            ...createOIMEntityWriterInPlace(),
            fillEntity: (slot, item) => {
                (slot as TOIMSlotEditable<typeof slot>).entity = Object.freeze({ ...item });
            },
        };
        const [rowEntityService, rows, channel] = collectionOver(freezing);

        rowEntityService.upsertEntity(rows, { id: 'r1', n: 1 });
        channel.flush();

        const stored = rowEntityService.getSlotByKey(rows, 'r1').entity;
        // `toEqual` first, on purpose: `Object.isFrozen(undefined)` is `true`, so
        // the freeze assertion alone would pass on a row that was never filed.
        expect(stored).toEqual({ id: 'r1', n: 1 });
        expect(Object.isFrozen(stored)).toBe(true);
    });

    /** Two identical bodies in two factories is the mismatched-pair hazard rebuilt one slot along. */
    it('both strategies name the same two ends, not two copies of them', () => {
        const inPlace = createOIMEntityWriterInPlace();
        const replacing = createOIMEntityWriterReplacing();
        expect(inPlace.fillEntity).toBe(replacing.fillEntity);
        expect(inPlace.clearEntity).toBe(replacing.clearEntity);
        expect(inPlace.putEntity).not.toBe(replacing.putEntity);
        expect(inPlace.patchEntity).not.toBe(replacing.patchEntity);
        expect(inPlace.deleteColumns).not.toBe(replacing.deleteColumns);
    });

    it('copies what the caller handed in when built with oimInsertEntityWithCopy', () => {
        const [rowEntityService, rows, channel] = collectionOver(createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }));
        const item: TRow = { id: 'r1', n: 1 };

        rowEntityService.upsertEntity(rows, item);
        channel.flush();
        item.n = 99;

        expect(rowEntityService.getSlotByKey(rows, 'r1').entity).not.toBe(item);
        expect(rowEntityService.getSlotByKey(rows, 'r1').entity).toEqual({ id: 'r1', n: 1 });
    });
});
