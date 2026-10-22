import { checkCaveatFigures } from './checkCaveatFigures';
import { PRICE_CATALOGUE_EXPORT_NAMES } from './priceCatalogueExportNames';
import type { TPriceCatalogue } from './TPriceCatalogue';
import type { TPricePair } from './TPricePair';

const ALTERNATIVE_PREFIX = 'alt.';
const CONTROLS_EXPORT_NAME = 'priceControls';

const loadCatalogueFile = async (exportName: string): Promise<readonly TPricePair[]> => {
    const catalogueModule = (await import(`./${exportName}.ts`)) as Record<string, readonly TPricePair[] | undefined>;
    const catalogue = catalogueModule[exportName];
    if (catalogue === undefined) throw new Error(`./${exportName}.ts exports no "${exportName}"`);
    return catalogue;
};

const firstLineOf = (error: unknown): string => String(error instanceof Error ? error.message : error).split('\n')[0];

export const loadPriceCatalogue = async (only: string | undefined): Promise<TPriceCatalogue> => {
    if (only === undefined) {
        const { pricePairs } = await import('./pricePairs');
        return pricePairs;
    }
    const controls = await loadCatalogueFile(CONTROLS_EXPORT_NAME);
    const priced: TPricePair[] = [];
    const alternatives: TPricePair[] = [];
    const catalogueById = new Map<string, string>();
    for (const pair of controls) catalogueById.set(pair.id, CONTROLS_EXPORT_NAME);
    for (const exportName of PRICE_CATALOGUE_EXPORT_NAMES) {
        if (exportName === CONTROLS_EXPORT_NAME) continue;
        let catalogue: readonly TPricePair[];
        try {
            catalogue = await loadCatalogueFile(exportName);
        } catch (error) {
            process.stderr.write(
                `price: ./${exportName}.ts did not load, so none of its pairs can be selected: ${firstLineOf(error)}\n`,
            );
            continue;
        }
        for (const pair of catalogue) {
            if (catalogueById.has(pair.id)) throw new Error(`price: two pairs share the id "${pair.id}"`);
            catalogueById.set(pair.id, exportName);
            (pair.id.startsWith(ALTERNATIVE_PREFIX) ? alternatives : priced).push(pair);
        }
    }
    checkCaveatFigures([...controls, ...priced, ...alternatives]);
    return { controls, priced, alternatives, catalogueOf: (id: string) => catalogueById.get(id) };
};
