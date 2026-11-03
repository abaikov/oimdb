import { registerOIMCoreInstance } from '../utils/registerOIMCoreInstance';
import { OIMDB } from '../OIMDB';

describe('a second instance of the core loading into one process', () => {
    it('lets the instance that is already registered load again', () => {
        expect(() => { registerOIMCoreInstance(OIMDB); }).not.toThrow();
    });

    it('refuses an instance that is not the one registered', () => {
        class OIMDBOfAnotherInstance {}
        expect(() => { registerOIMCoreInstance(OIMDBOfAnotherInstance); }).toThrow(/loaded twice/);
    });
});
