import { OIMJsonPersistor } from './OIMJsonPersistor';
import { TOIMJsonPersistorOptions } from '../types/TOIMJsonPersistorOptions';

export function createJsonPersistor(
    options: TOIMJsonPersistorOptions = {}
): OIMJsonPersistor {
    return new OIMJsonPersistor(options);
}
