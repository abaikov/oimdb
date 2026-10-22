// What an adapter answered and what the reference model answered — ONE derivation,
// because two runners ask it. A second copy of the fold would let a store that
// skipped work pass in one runner and fail in the other. See `signature.md`.
import type { TWorkerOk } from './measureBatch';

// The count travels beside the digest because a 32-bit fold can collide and a
// length cannot.
export const signatureOf = (
    digestA: number,
    digestB: number,
    distinctA: number,
    distinctB: number
): string =>
    `${digestA.toString(16)}/${digestB.toString(16)} ${distinctA}n/${distinctB}n`;

// The same SHAPE as `signatureOf` and deliberately a DIFFERENT function: the two are
// not interchangeable and a reader has to tell at the call site which question was
// asked. `r` marks rows where the sequence signature's `n` marks distinct renders.
export const finalStateSignatureOf = (
    stateA: number,
    stateB: number,
    rowsA: number,
    rowsB: number
): string => `${stateA.toString(16)}/${stateB.toString(16)} ${rowsA}r/${rowsB}r`;

// `unanswerable` IS NOT "NO NEWS": a verify pass with no reference answer in it is
// not a verify pass, and default agreement is the hole the model was added to close.
export type TAnswer =
    | {
          status: 'answered';
          signature: string;
          oracle: string;
          evidence: string;
      }
    | { status: 'unanswerable'; problem: string };

// BY SEQUENCE where the frame count is the SCRIPT's decision; BY FINAL STATE where
// it belongs to the STORE. Read off `scenario.finalStateOnly`.
export const answerOf = (result: TWorkerOk, byFinalState: boolean): TAnswer => {
    const evidence =
        result.a.head === undefined
            ? ''
            : `${result.a.head}  (${result.a.rows} rows, ${result.a.distinct} distinct renders)`;

    if (byFinalState) {
        if (
            result.stateA === undefined ||
            result.stateB === undefined ||
            result.oracleStateA === undefined ||
            result.oracleStateB === undefined ||
            result.oracleRowsA === undefined ||
            result.oracleRowsB === undefined ||
            result.a.rows === undefined ||
            result.b.rows === undefined
        ) {
            // A missing reference answer must never read as agreement.
            return {
                status: 'unanswerable',
                problem:
                    'the verify pass produced no reference FINAL STATE for a scenario judged on one',
            };
        }
        return {
            status: 'answered',
            signature: finalStateSignatureOf(
                result.stateA,
                result.stateB,
                result.a.rows,
                result.b.rows
            ),
            oracle: finalStateSignatureOf(
                result.oracleStateA,
                result.oracleStateB,
                result.oracleRowsA,
                result.oracleRowsB
            ),
            evidence,
        };
    }

    if (
        result.oracleA === undefined ||
        result.oracleB === undefined ||
        result.oracleDistinctA === undefined ||
        result.oracleDistinctB === undefined
    ) {
        return {
            status: 'unanswerable',
            problem: 'the verify pass produced no reference digest',
        };
    }
    return {
        status: 'answered',
        signature: signatureOf(
            result.digestA ?? 0,
            result.digestB ?? 0,
            result.a.distinct,
            result.b.distinct
        ),
        oracle: signatureOf(
            result.oracleA,
            result.oracleB,
            result.oracleDistinctA,
            result.oracleDistinctB
        ),
        evidence,
    };
};
