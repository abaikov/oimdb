import type {ReactNode} from 'react';
import clsx from 'clsx';
import {benchResults} from './data';
import styles from './styles.module.css';

const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export default function BenchMemory(): ReactNode {
  const rows = (benchResults.memory ?? []).filter(row => row.point === 'default');
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        Nothing weighed yet. Run <code>npm run bench -- memory</code> in <code>packages/bench</code>.
      </div>
    );
  }
  const weighed = rows.filter(row => row.held !== null).sort((a, b) => (a.held ?? 0) - (b.held ?? 0));
  const widest = Math.max(1, ...weighed.map(row => row.held ?? 0));
  const population = benchResults.points.find(point => point.key === 'default')?.n ?? 1;
  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <table className={styles.results}>
          <thead>
            <tr>
              <th>participant</th>
              <th>held</th>
              <th className={styles.numeric}>per row</th>
              <th>measured</th>
            </tr>
          </thead>
          <tbody>
            {weighed.map(row => (
              <tr key={row.adapter} className={clsx(!row.fresh && styles.rowFlagged)}>
                <td>{row.adapter}</td>
                <td className={styles.barCell}>
                  <span className={styles.bar} style={{width: `${Math.max(2, ((row.held ?? 0) / widest) * 100)}%`}} />
                  <span className={styles.barLabel}>{formatBytes(row.held ?? 0)}</span>
                </td>
                <td className={styles.numeric}>{((row.held ?? 0) / population).toFixed(0)} B</td>
                <td>
                  {row.measuredAt.slice(0, 10)}
                  {row.fresh ? '' : ' · stale'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows
        .filter(row => row.failure !== null)
        .map(row => (
          <p key={row.adapter} className={styles.problem}>
            ✗ <strong>{row.adapter}</strong> — {row.failure}
          </p>
        ))}
    </div>
  );
}
