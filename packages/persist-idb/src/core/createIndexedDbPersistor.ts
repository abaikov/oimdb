import { OIMIndexedDbPersistor } from './OIMIndexedDbPersistor';
import { TOIMIndexedDbPersistorOptions } from '../types/TOIMIndexedDbPersistorOptions';

export function createIndexedDbPersistor(
    options: TOIMIndexedDbPersistorOptions
): OIMIndexedDbPersistor {
    return new OIMIndexedDbPersistor(options);
}
