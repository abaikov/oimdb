import { OIMDevStateReader } from '../src/core/OIMDevStateReader';
import { OIMDevRegistryStateSource } from '../src/core/OIMDevRegistryStateSource';
import { OIMDevHttpStateSource } from '../src/core/OIMDevHttpStateSource';

const devRegistry = {
    inspect: () => ({ collections: { cards: { count: 2 } }, computeds: { total: { status: 'fresh', value: 2 } } }),
    dumpString: () => 'cards: 2',
};

describe('what the reader answers', () => {
    const reader = new OIMDevStateReader(new OIMDevRegistryStateSource(devRegistry));

    it('prints the whole snapshot as indented JSON', async () => {
        expect(JSON.parse(await reader.readInspectText())).toEqual(devRegistry.inspect());
        expect(await reader.readInspectText()).toContain('\n  "collections"');
    });

    it('hands the dump through as text', async () => {
        expect(await reader.readDumpText()).toBe('cards: 2');
    });

    it('answers one collection and one computed by name', async () => {
        expect(JSON.parse(await reader.readCollectionText('cards'))).toEqual({ count: 2 });
        expect(JSON.parse(await reader.readComputedText('total'))).toEqual({ status: 'fresh', value: 2 });
    });

    it('names what is registered when the name is not', async () => {
        expect(await reader.readCollectionText('decks')).toBe("Collection 'decks' not found. Registered: cards");
        expect(await reader.readComputedText('sum')).toBe("Computed 'sum' not found. Registered: total");
    });

    it('says where to start the server when nothing listens', async () => {
        const httpReader = new OIMDevStateReader(new OIMDevHttpStateSource('http://127.0.0.1:1'));
        await expect(httpReader.readInspectText()).rejects.toThrow('No "oimdb serve" at http://127.0.0.1:1');
    });
});
