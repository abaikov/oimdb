import {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import {auditOf, benchResults, codeLinesOf, formatMs, formatRatio, isClean, measuredPointKeys, tableOf} from './data';
import styles from './styles.module.css';

const barWidth = (ratio: number, widest: number): string =>
  `${Math.max(2, (Math.log2(1 + ratio) / Math.log2(1 + widest)) * 100)}%`;

export default function BenchScenarioTables(): ReactNode {
  const points = measuredPointKeys;
  const [point, setPoint] = useState(points[0] ?? 'default');
  const scenarios = benchResults.scenarios.filter(scenario => tableOf(point, scenario.key) !== undefined);

  return (
    <div className={styles.root}>
      {points.length > 1 && (
        <div className={styles.controls}>
          <div className={styles.segmented} role="group" aria-label="Operating point">
            {points.map(key => (
              <button
                key={key}
                type="button"
                className={clsx(styles.segment, key === point && styles.segmentActive)}
                onClick={() => setPoint(key)}>
                {key}
              </button>
            ))}
          </div>
        </div>
      )}
      {scenarios.length === 0 && <div className={styles.empty}>Nothing measured at this point yet.</div>}
      {scenarios.map(scenario => {
        const table = tableOf(point, scenario.key);
        if (table === undefined) return null;
        const widest = Math.max(1, ...table.rows.map(row => row.ratio ?? 0));
        const card = auditOf('scenario', scenario.key)?.card;
        return (
          <section key={scenario.key} id={`${point}-${scenario.key}`} className={styles.scenario}>
            <h3>
              {scenario.label} <code>{scenario.key}</code>
              {card && <span className={clsx(styles.verdict, styles[`verdict_${card.verdict}`])}>{card.verdict}</span>}
            </h3>
            <p className={styles.description}>{scenario.description}</p>
            <div className={styles.scroll}>
              <table className={styles.results}>
                <thead>
                  <tr>
                    <th>place</th>
                    <th>participant</th>
                    <th className={styles.numeric}>time</th>
                    <th>× anchor</th>
                    <th className={styles.numeric}>drift</th>
                    <th className={styles.numeric}>timed runs</th>
                    <th className={styles.numeric}>code lines</th>
                    <th className={styles.numeric}>renders A / B</th>
                    <th>measured</th>
                    <th>flags</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map(row => (
                    <tr key={row.adapter} className={clsx(!isClean(row) && styles.rowFlagged)}>
                      <td>{row.place === null ? '≈' : `#${row.place}`}</td>
                      <td>{row.adapter}</td>
                      <td className={styles.numeric}>{formatMs(row.ms)}</td>
                      <td className={styles.barCell}>
                        {row.ratio !== null && (
                          <>
                            <span className={styles.bar} style={{width: barWidth(row.ratio, widest)}} />
                            <span className={styles.barLabel}>{formatRatio(row.ratio)}</span>
                          </>
                        )}
                      </td>
                      <td className={styles.numeric}>{(row.drift * 100).toFixed(1)}%</td>
                      <td
                        className={styles.numeric}
                        title={`${row.processes} processes × ${row.samples} samples × ${row.repeat} runs; batch took ${Math.round(row.batchSeconds)} s`}>
                        {row.runs.toLocaleString('en-US')}
                      </td>
                      <td className={styles.numeric}>{codeLinesOf(row.adapter, scenario) ?? '—'}</td>
                      <td className={styles.numeric}>
                        {row.distinct[0]}/{row.deliveries[0]} · {row.distinct[1]}/{row.deliveries[1]}
                      </td>
                      <td>{row.measuredAt.slice(0, 10)}</td>
                      <td>{[...row.stale.map(reason => `stale: ${reason}`), ...row.issues].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.problems.map(problem => (
              <p key={problem.adapter} className={styles.problem}>
                ✗ <strong>{problem.adapter}</strong> — {problem.text}
              </p>
            ))}
            {table.missing.length > 0 && <p className={styles.note}>Not yet measured: {table.missing.join(', ')}.</p>}
            {table.declined.length > 0 && (
              <details className={styles.note}>
                <summary>Declined by {table.declined.map(entry => entry.adapter).join(', ')}</summary>
                {table.declined.map(entry => (
                  <p key={entry.adapter}>
                    <strong>{entry.adapter}</strong>: {entry.reason}
                  </p>
                ))}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
