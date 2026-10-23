import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_ENTRY = join(ROOT, 'packages', 'core', 'src', 'index.ts');
const DOCS_WITH_THE_TABLE = [
    join(ROOT, 'packages', 'core', 'README.md'),
    join(ROOT, 'website', 'docs', 'performance', 'bundle-size.md'),
    join(ROOT, 'website', 'docs', 'why-oimdb.md'),
];

const SCENARIOS = [
    {
        consumer: 'Everything `@oimdb/core` exports',
        code: `export * from '@oimdb/core';`,
    },
    {
        consumer: 'One entity store slot: `OIMDB`, `createOIMEntityService`, `upsertEntity`, `getSlotByKey`',
        code: `import { OIMDB, createOIMEntityService } from '@oimdb/core';
const db = new OIMDB();
const userService = createOIMEntityService(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
userService.slotContentService.upsertEntity(users, { id: 'u1' });
export const read = userService.getSlotByKey(users, 'u1');`,
    },
    {
        consumer: 'The same, plus one effect and `db.flush()`',
        code: `import { OIMDB, OIMEffectService, createOIMEntityService } from '@oimdb/core';
const db = new OIMDB();
const userService = createOIMEntityService(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
const user = userService.slotContentService.upsertEntity(users, { id: 'u1' });
export const effect = OIMEffectService.INSTANCE.createEffect(db, [user], [], () => {});
db.flush();`,
    },
    {
        consumer: 'The same, plus one index: `createOIMIndexService`',
        code: `import { OIMDB, OIMEffectService, createOIMEntityService, createOIMIndexService } from '@oimdb/core';
const db = new OIMDB();
const userService = createOIMEntityService(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
const byTeamService = createOIMIndexService(db, { entityService: userService, keyOf: user => user.team });
const byTeam = byTeamService.createIndexStoreSlot(users);
userService.slotContentService.upsertEntity(users, { id: 'u1', team: 't1' });
export const effect = OIMEffectService.INSTANCE.createEffect(db, [byTeamService.getSlotByKey(byTeam, 't1')], [], () => {});
db.flush();`,
    },
    {
        consumer: 'An ordered bucket with commands: `createOIMBucketService`, `OIMSlotContentBucketServiceArrayDriven`, `OIMBucketCommands`',
        code: `import { OIMDB, OIMBucketCommands, OIMSlotContentBucketServiceArrayDriven, createOIMBucketService, createOIMEntityService } from '@oimdb/core';
const db = new OIMDB();
const userService = createOIMEntityService(db, { keyOf: user => user.id });
const users = userService.createStoreSlot(db);
const membersService = new OIMSlotContentBucketServiceArrayDriven({ bucketCommands: new OIMBucketCommands({}) });
const orderedService = createOIMBucketService(db, { slotContentService: membersService });
const ordered = orderedService.createStoreSlot(db);
const all = orderedService.holdSlotByKey(ordered, 'all');
membersService.insertBucketMemberSlotAt(all, 0, userService.slotContentService.upsertEntity(users, { id: 'u1' }));
export { orderedService, ordered };`,
    },
];

const measure = async (code) => {
    const result = await esbuild.build({
        stdin: { contents: code, resolveDir: ROOT, loader: 'ts' },
        bundle: true,
        write: false,
        minify: true,
        treeShaking: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2020',
        alias: { '@oimdb/core': CORE_ENTRY },
        logLevel: 'silent',
    });
    const bytes = result.outputFiles[0].contents;
    return { minified: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
};

const rows = [];
for (const scenario of SCENARIOS) rows.push({ ...scenario, ...(await measure(scenario.code)) });

const table = [
    '| Consumer | Minified | Minified + gzip |',
    '|---|---:|---:|',
    ...rows.map(row => `| ${row.consumer} | ${row.minified} B | ${row.gzip} B |`),
].join('\n');

const BLOCK = /(<!-- bundle-size:begin -->|\{\/\* bundle-size:begin \*\/\})\n(?:[\s\S]*?\n)?(<!-- bundle-size:end -->|\{\/\* bundle-size:end \*\/\})/;
const writing = process.argv.includes('--write');
const stale = [];
for (const path of DOCS_WITH_THE_TABLE) {
    const text = readFileSync(path, 'utf8');
    const match = text.match(BLOCK);
    if (match === null) {
        stale.push(`${path.slice(ROOT.length + 1)}: has no bundle-size:begin / bundle-size:end block`);
        continue;
    }
    const current = `${match[1]}\n${table}\n${match[2]}`;
    if (match[0] === current) continue;
    if (writing) writeFileSync(path, text.replace(BLOCK, current));
    else stale.push(`${path.slice(ROOT.length + 1)}: the bundle-size table does not match what the core builds to`);
}

console.log(table);
if (stale.length === 0 || writing) {
    if (writing) console.log('bundle-size tables written');
    process.exit(0);
}
for (const line of stale) console.log(line);
console.log('Run `npm run size:write` to put the measured sizes in the docs, and review the change.');
process.exit(1);
