// One pair, one arm, one process; spawned by `retained/runRetainedPairs.ts`.
import { measureRetainedArm } from './retained/measureRetainedArm';
import { retainedPairs } from './retained/retainedPairs';
import type { TRetainedWorkerOutput } from './retained/TRetainedWorkerOutput';

const [pairId, armArg] = process.argv.slice(2);

const emit = (result: TRetainedWorkerOutput): void => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
};

const exposedGc = (globalThis as { gc?: () => void }).gc;
const gcAvailable = exposedGc !== undefined;
const collect = (): void => {
    if (exposedGc !== undefined) exposedGc();
};

const pair = retainedPairs.byId(pairId ?? '');

if (armArg !== 'on' && armArg !== 'off') {
    emit({
        status: 'failed',
        reason: `the arm must be "on" or "off", and this process was handed "${String(armArg)}".`,
    });
} else if (pair === undefined) {
    emit({ status: 'failed', reason: `no pair is filed under "${String(pairId)}".` });
} else if (!gcAvailable) {
    emit({
        status: 'failed',
        reason:
            'the retained worker needs --expose-gc: without a collection before each reading, a delta ' +
            'is the difference between two collection schedules. No figure is reported.',
    });
} else {
    emit({ status: 'measured', reading: measureRetainedArm(pair, armArg, collect, gcAvailable) });
}
