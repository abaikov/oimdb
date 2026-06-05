import { OIMAsyncKVPersistor } from './OIMAsyncKVPersistor';
import { TOIMAsyncKVPersistorOptions } from '../types/TOIMAsyncKVPersistorOptions';

export function createAsyncKVPersistor(
    options: TOIMAsyncKVPersistorOptions
): OIMAsyncKVPersistor {
    return new OIMAsyncKVPersistor(options);
}
