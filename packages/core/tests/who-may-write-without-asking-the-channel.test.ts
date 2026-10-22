import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceRoot = join(__dirname, '..', 'src');

const CHANNEL = 'engine/channel/OIMChannelService.ts';

const engineLayersThatWriteForACallerWhoAsked = [
    'engine/column/OIMColumnOwnerPushDriven.ts',
    'engine/slot/OIMSlotOwnerService.ts',
].sort();

const filesAllowedToWriteWithoutAsking = [
    CHANNEL,
    'engine/entity/OIMSlotContentEntityService.ts',
    ...engineLayersThatWriteForACallerWhoAsked,
].sort();

const typeScriptFilesUnder = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...typeScriptFilesUnder(full));
        else if (/\.ts$/.test(entry.name)) found.push(full);
    }
    return found;
};

const isATest = (path: string): boolean => /(^|\/)tests\//.test(path);

const isAnEngineLayer = (path: string): boolean => engineLayersThatWriteForACallerWhoAsked.includes(path);

const engineLayerNames = (): string[] => engineLayersThatWriteForACallerWhoAsked
    .map(path => path.replace(/^.*\//, '').replace(/\.ts$/, ''))
    .sort();

const facadeFiles = (): string[] => typeScriptFilesUnder(join(sourceRoot, 'facade'))
    .map(path => relative(sourceRoot, path).split('\\').join('/'))
    .filter(path => !isATest(path))
    .sort();

const namesTheUncheckedDoor = (path: string): boolean =>
    readFileSync(path, 'utf8').includes('writeWithoutFlushCheck');

const callersOfTheUncheckedDoor = (): string[] => typeScriptFilesUnder(sourceRoot)
    .map(path => relative(sourceRoot, path).split('\\').join('/'))
    .filter(path => !isATest(path))
    .filter(path => namesTheUncheckedDoor(join(sourceRoot, path)))
    .sort();

const codeOf = (path: string): string =>
    readFileSync(join(sourceRoot, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

type TMember = { name: string; isPublic: boolean; body: string };

const MEMBER_START = /^ {4}(?:declare )?(public|private|protected) (?:override )?(?:readonly )?(?:get |set )?([A-Za-z_$][\w$]*)/gm;

const membersOf = (code: string): TMember[] => {
    const starts: { at: number; isPublic: boolean; name: string }[] = [];
    MEMBER_START.lastIndex = 0;
    let match = MEMBER_START.exec(code);
    while (match !== null) {
        starts.push({ at: match.index, isPublic: match[1] === 'public', name: match[2] });
        match = MEMBER_START.exec(code);
    }
    return starts.map((start, i) => ({
        name: start.name,
        isPublic: start.isPublic,
        body: code.slice(start.at, i + 1 < starts.length ? starts[i + 1].at : code.length),
    }));
};

const firstAt = (body: string, pattern: RegExp): number => {
    const match = pattern.exec(body);
    return match === null ? Infinity : match.index;
};

const ASKS = /\b(?:assertWritable|assertNotFlushing)\(/;

const membersThatWriteBeforeAsking = (code: string): TMember[] => {
    const members = membersOf(code).filter(member => member.name !== 'constructor');
    const writingBeforeAsking = new Set<string>();
    let grew = true;
    while (grew) {
        grew = false;
        for (const member of members) {
            if (writingBeforeAsking.has(member.name)) continue;
            const writes = [/writeWithoutFlushCheck/, ...[...writingBeforeAsking].map(name => new RegExp(`this\\.${name}\\b`))];
            const firstWrite = Math.min(...writes.map(pattern => firstAt(member.body, pattern)));
            if (firstWrite === Infinity || firstAt(member.body, ASKS) < firstWrite) continue;
            writingBeforeAsking.add(member.name);
            grew = true;
        }
    }
    return members.filter(member => writingBeforeAsking.has(member.name));
};

describe('who may write without asking the channel whether it is flushing', () => {
    it('is exactly the files on the list, and nobody else', () => {
        expect(callersOfTheUncheckedDoor()).toEqual(filesAllowedToWriteWithoutAsking);
    });

    it('keeps no name on the list that no longer names the door', () => {
        const naming = new Set(callersOfTheUncheckedDoor());
        expect(filesAllowedToWriteWithoutAsking.filter(path => !naming.has(path))).toEqual([]);
    });

    it('leaves every allowed caller a check before it writes, its own or the content owner\'s', () => {
        const unchecked = filesAllowedToWriteWithoutAsking
            .filter(path => path !== CHANNEL)
            .filter(path => !isAnEngineLayer(path))
            .filter(path => {
                const code = readFileSync(join(sourceRoot, path), 'utf8');
                return !code.includes('assertNotFlushing') && !/\.assertWritable\(/.test(code);
            });
        expect(unchecked).toEqual([]);
    });

    it('asks before it writes in every public member of an allowed caller, through any member of its own file', () => {
        const writingBeforeAsking = filesAllowedToWriteWithoutAsking
            .filter(path => path !== CHANNEL)
            .filter(path => !isAnEngineLayer(path))
            .flatMap(path => membersThatWriteBeforeAsking(codeOf(path))
                .filter(member => member.isPublic)
                .map(member => `${path} ${member.name}`));
        expect(writingBeforeAsking).toEqual([]);
    });

    it('exports no engine layer from the package as a value', () => {
        const valueExports = readFileSync(join(sourceRoot, 'index.ts'), 'utf8')
            .split('\n')
            .filter(line => /^export \{/.test(line))
            .join('\n');
        expect(engineLayerNames().filter(name => new RegExp(`\\b${name}\\b`).test(valueExports))).toEqual([]);
    });

    it('hands no engine layer out of a facade through a public field', () => {
        const handedOut = facadeFiles().flatMap(path => membersOf(codeOf(path))
            .filter(member => member.isPublic)
            .filter(member => engineLayerNames().some(name => new RegExp(`^[^\\n]*\\b${name}\\b`).test(member.body)))
            .filter(member => /^ {4}public (?:readonly )?\w+\s*[:;]/.test(member.body) || /^ {4}public get /.test(member.body))
            .map(member => `${path} ${member.name}`));
        expect(handedOut).toEqual([]);
    });

    it('has the content owner\'s assertWritable ask the channel', () => {
        const contentOwner = readFileSync(join(sourceRoot, 'engine/slot/OIMSlotOwnerService.ts'), 'utf8');
        expect(contentOwner).toContain(
            'public assertWritable(slot: TOIMSlot): void {\n        OIMChannelService.INSTANCE.assertNotFlushing(oimGetChannelSlot(slot));',
        );
    });

    it('leaves the asking door the only one the channel guards', () => {
        const channel = readFileSync(join(sourceRoot, CHANNEL), 'utf8');
        expect(channel).toContain('this.assertNotFlushing(channelSlot);\n        this.writeWithoutFlushCheck(channelSlot, slot);');
    });
});
