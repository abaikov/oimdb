import { OIMLocalStoragePersistor } from './OIMLocalStoragePersistor';
import { TOIMLocalStoragePersistorOptions } from '../types/TOIMLocalStoragePersistorOptions';

export function createLocalStoragePersistor(
    options: TOIMLocalStoragePersistorOptions = {}
): OIMLocalStoragePersistor {
    return new OIMLocalStoragePersistor(options);
}
