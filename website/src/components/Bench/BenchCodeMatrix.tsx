import type {ReactNode} from 'react';
import clsx from 'clsx';
import {benchResults, HAND_WRITTEN_STORE_NOTE, runsOurHandWrittenStore} from './data';
import styles from './styles.module.css';

const SHAPE_LABELS: Record<string, string> = {
  bind: 'Board screen',
  bindPerGroup: 'A consumer per group',
  'churn.row': 'Subscribe and unsubscribe',
  'churn.wide': 'One subscriber over many sources',
  'churn.column': 'Subscribers on one column',
  'churn.chain': 'Subscribers over a derivation chain',
  'churn.diamond': 'Subscribers over a diamond',
  'reads.byKey': 'Read a page by key',
  'reads.byWindow': 'Scroll a window',
  'reads.bySwitch': 'Switch the viewed group',
  'reads.byTwoAxes': 'Filter on two axes',
  relations: 'Related entities',
  single: 'One value',
};

const isAnchor = (adapter: string): boolean => adapter.startsWith('baseline-');

const toneOf = (excess: number, isLeast: boolean): string => {
  if (isLeast) return styles.toneFaster3;
  if (excess <= 1.25) return styles.toneFaster2;
  if (excess <= 1.6) return styles.toneFaster1;
  if (excess <= 2.5) return styles.toneMiddle;
  if (excess <= 5) return styles.toneSlower1;
  if (excess <= 10) return styles.toneSlower2;
  return styles.toneSlower3;
};

export default function BenchCodeMatrix(): ReactNode {
  const participants = benchResults.participants.map(participant => participant.name);
  const shapes = [...new Set(benchResults.scenarios.filter(scenario => !scenario.floor).map(scenario => scenario.shape))];
  const codeLines = benchResults.codeLines ?? {};
  if (Object.keys(codeLines).length === 0) {
    return <div className={styles.empty}>No code volume published yet.</div>;
  }
  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.legend} aria-hidden="true">
          <span className={clsx(styles.swatch, styles.toneFaster3)} /> 🏆 fewest lines among libraries
          <span className={clsx(styles.swatch, styles.toneMiddle)} /> about 2× more
          <span className={clsx(styles.swatch, styles.toneSlower3)} /> over 10× more
          <span className={clsx(styles.swatch, styles.toneNeutral)} /> no library (Map baselines)
          <span className={styles.swatch} /> · declined
        </span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th className={styles.corner}>lines of code to wire</th>
              {participants.map(name => (
                <th key={name} className={styles.columnHead}>
                  <span>{name}</span>
                  {runsOurHandWrittenStore(name) && <span className={styles.columnHeadNote}>{HAND_WRITTEN_STORE_NOTE}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shapes.map(shape => {
              const tasks = benchResults.scenarios.filter(scenario => !scenario.floor && scenario.shape === shape);
              const libraryLines = participants
                .filter(name => !isAnchor(name))
                .map(name => codeLines[name]?.[shape])
                .filter((lines): lines is number => lines !== undefined && lines > 0);
              const least = libraryLines.length === 0 ? undefined : Math.min(...libraryLines);
              return (
                <tr key={shape}>
                  <th className={styles.rowHead} title={tasks.map(task => task.label).join(', ')}>
                    {SHAPE_LABELS[shape] ?? shape}{' '}
                    <span className={styles.note}>
                      {tasks.length} task{tasks.length === 1 ? '' : 's'}
                    </span>
                  </th>
                  {participants.map(name => {
                    const lines = codeLines[name]?.[shape];
                    if (lines === undefined) {
                      return (
                        <td key={name} className={styles.cellDeclined} title="declined">
                          ·
                        </td>
                      );
                    }
                    const isLeast = !isAnchor(name) && lines === least;
                    const excess = least === undefined ? 1 : lines / least;
                    return (
                      <td
                        key={name}
                        className={clsx(
                          styles.cell,
                          isAnchor(name) ? styles.toneNeutral : toneOf(excess, isLeast),
                          isLeast && styles.winner,
                        )}
                        title={`${name} · ${SHAPE_LABELS[shape] ?? shape}: ${lines} lines — ${tasks.map(task => task.label).join(', ')}`}>
                        {isLeast ? `🏆 ${lines}` : lines}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
