import { busyForTheDefaultGate, gateWasRaised } from '../harness/load';
import { pointOf } from './points';
import type { TCellRecord } from './types';

export type TQualityIssue =
    | 'unresolved'
    | 'fine-unresolved'
    | 'unattested'
    | 'busy'
    | 'gate-raised'
    | 'lost'
    | 'gc-missing'
    | 'shallow';

export const QUALITY_TEXT: Readonly<Record<TQualityIssue, string>> = {
    unresolved: 'the control pair of its batch was not told apart — the batch could not resolve a known difference',
    'fine-unresolved':
        'the fine control pair (one write path against two) was not told apart — gaps at the scale of a doubled write are unattested',
    unattested: 'no control pair ran in its batch, so nothing attests what the batch could resolve',
    busy: 'foreign load during its batch exceeded the default gate',
    'gate-raised': 'measured under a load gate raised above the default',
    lost: 'some of its processes produced nothing',
    'gc-missing': 'a worker of its batch ran without --expose-gc',
    shallow: 'measured with fewer processes than its point asks for (--processes); `next --retry` deepens it',
};

export const qualityIssuesOf = (record: TCellRecord, storeless: boolean): TQualityIssue[] => {
    const issues: TQualityIssue[] = [];
    if (!storeless) {
        if (record.batch.resolution === undefined) issues.push('unattested');
        else if (!record.batch.resolution.resolved) issues.push('unresolved');
        else if (record.batch.resolution.fine?.resolved === false) issues.push('fine-unresolved');
    }
    if (busyForTheDefaultGate(record.batch.load)) issues.push('busy');
    if (gateWasRaised(record.batch.load)) issues.push('gate-raised');
    if (record.outcome.status === 'measured' && record.outcome.lost > 0) issues.push('lost');
    if (record.batch.gcMissing) issues.push('gc-missing');
    if (record.batch.point.processes < pointOf(record.key.point).processes) issues.push('shallow');
    return issues;
};
