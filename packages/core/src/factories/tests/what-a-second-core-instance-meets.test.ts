import { oimRegisterCoreInstance } from '../defaults/oimRegisterCoreInstance';
import { OIMDB } from '../OIMDB';

describe('a second instance of the core loading into one process', () => {
    it('lets the instance that is already registered load again', () => {
        expect(() => { oimRegisterCoreInstance(OIMDB); }).not.toThrow();
    });

    it('refuses an instance that is not the one registered', () => {
        class OIMDBOfAnotherInstance {}
        expect(() => { oimRegisterCoreInstance(OIMDBOfAnotherInstance); }).toThrow(/loaded twice/);
    });
});
