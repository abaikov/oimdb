import { OIMMemoryPersistor } from './OIMMemoryPersistor';
import { TOIMMemoryPersistorOptions } from '../types/TOIMMemoryPersistorOptions';

export function createMemoryPersistor(
    options: TOIMMemoryPersistorOptions = {}
): OIMMemoryPersistor {
    return new OIMMemoryPersistor(options);
}
