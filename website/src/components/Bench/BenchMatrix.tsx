import {useMemo, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import {benchResults, formatMs, formatRatio, HAND_WRITTEN_STORE_NOTE, isClean, measuredPointKeys, runsOurHandWrittenStore, tableOf, type BenchRow, type BenchScenario} from './data';
import styles from './styles.module.css';

const isAnchor = (adapter: string): boolean => adapter.startsWith('baseline-');

const fastestOf = (rows: readonly BenchRow[]): BenchRow | undefined =>
  rows
    .filter(row => !isAnchor(row.adapter))
    .reduce<BenchRow | undefined>((best, row) => (best === undefined || row.ms < best.ms ? row : best), undefined);

const toneOf = (slowdown: number, isWinner: boolean): string => {
  if (isWinner) return styles.toneFaster3;
  if (slowdown <= 1.25) return styles.toneFaster2;
  if (slowdown <= 1.6) return styles.toneFaster1;
  if (slowdown <= 2.5) return styles.toneMiddle;
  if (slowdown <= 5) return styles.toneSlower1;
  if (slowdown <= 10) return styles.toneSlower2;
  return styles.toneSlower3;
};

const formatTimes = (slowdown: number): string =>
  `${slowdown < 10 ? slowdown.toFixed(slowdown < 1 ? 2 : 1) : Math.round(slowdown)}×`;

const formatSlowdown = (row: BenchRow, slowdown: number, isWinner: boolean): string =>
  isWinner ? `🏆 ${formatMs(row.ms)}` : formatTimes(slowdown);

type THover = {x: number; y: number; scenario: string; adapter: string; row: BenchRow};

function Tooltip({hover}: {hover: THover}): ReactNode {
  const {row} = hover;
  return (
    <div className={styles.tooltip} style={{left: hover.x + 14, top: hover.y + 14}} role="tooltip">
      <div className={styles.tooltipTitle}>
        {hover.adapter} · {hover.scenario}
      </div>
      <div>
        {formatMs(row.ms)}
        {row.ratio === null ? '' : ` · ${formatRatio(row.ratio)} the anchor`}
      </div>
      <div>drift {(row.drift * 100).toFixed(1)}% · place {row.place ?? '≈ (tied)'}</div>
      <div>
        renders A {row.distinct[0]} of {row.deliveries[0]} deliveries · B {row.distinct[1]} of{' '}
        {row.deliveries[1]}
      </div>
      <div>measured {row.measuredAt.slice(0, 10)}</div>
      {row.stale.length > 0 && <div>stale: {row.stale.join(', ')}</div>}
      {row.issues.length > 0 && <div>flagged: {row.issues.join(', ')}</div>}
    </div>
  );
}

type TScenarioHover = {x: number; y: number; scenario: BenchScenario};

function ScenarioTooltip({hover, point}: {hover: TScenarioHover; point: string}): ReactNode {
  const pointShape = benchResults.points.find(candidate => candidate.key === point);
  return (
    <div className={clsx(styles.tooltip, styles.scenarioTooltip)} style={{left: hover.x + 14, top: hover.y + 14}} role="tooltip">
      <div className={styles.tooltipTitle}>{hover.scenario.label}</div>
      <p className={styles.scenarioTooltipText}>{hover.scenario.description}</p>
      {pointShape !== undefined && (
        <div className={styles.scenarioTooltipSetup}>
          Setup: {pointShape.n.toLocaleString('en-US')} rows split into groups, each row with a group, a rank and a
          label. View A and view B each show a page of {pointShape.window} rows of one group, sorted by rank. A step is
          one batch of changes followed by one update of the screen.
        </div>
      )}
    </div>
  );
}

export default function BenchMatrix(): ReactNode {
  const points = measuredPointKeys;
  const [point, setPoint] = useState(points[0] ?? 'default');
  const [cleanOnly, setCleanOnly] = useState(false);
  const [hover, setHover] = useState<THover | undefined>();
  const [scenarioHover, setScenarioHover] = useState<TScenarioHover | undefined>();
  const participants = benchResults.participants.map(participant => participant.name);

  const rows = useMemo(
    () => benchResults.scenarios.filter(scenario => !scenario.floor && tableOf(point, scenario.key) !== undefined),
    [point],
  );

  if (benchResults.tables.length === 0) {
    return (
      <div className={styles.empty}>
        No cell has been measured yet. Run <code>npm run bench -- next</code> in{' '}
        <code>packages/bench</code>; the page is rebuilt from what it publishes.
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        {points.length > 1 && (
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
        )}
        <label className={styles.toggle}>
          <input type="checkbox" checked={cleanOnly} onChange={event => setCleanOnly(event.target.checked)} />
          only fresh, unflagged cells
        </label>
        <span className={styles.legend} aria-hidden="true">
          <span className={clsx(styles.swatch, styles.toneFaster3)} /> 🏆 fastest library, its time
          <span className={clsx(styles.swatch, styles.toneMiddle)} /> about 2× slower
          <span className={clsx(styles.swatch, styles.toneSlower3)} /> over 10× slower
          <span className={clsx(styles.swatch, styles.toneNeutral)} /> no library (Map baselines)
          <span className={clsx(styles.swatch, styles.hatched)} /> stale or flagged
        </span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th className={clsx(styles.corner, styles.stickyColumn)}>scenario</th>
              {participants.map(name => (
                <th key={name} className={styles.columnHead}>
                  <span>{name}</span>
                  {runsOurHandWrittenStore(name) && <span className={styles.columnHeadNote}>{HAND_WRITTEN_STORE_NOTE}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(scenario => {
              const table = tableOf(point, scenario.key);
              const fastest = fastestOf(table?.rows ?? []);
              return (
                <tr key={scenario.key}>
                  <th
                    className={clsx(styles.rowHead, styles.stickyColumn)}
                    onMouseMove={event => setScenarioHover({x: event.clientX, y: event.clientY, scenario})}
                    onMouseLeave={() => setScenarioHover(undefined)}>
                    <a href={`#${point}-${scenario.key}`}>{scenario.label}</a>
                  </th>
                  {participants.map(name => {
                    const row = table?.rows.find(candidate => candidate.adapter === name);
                    if (table?.declined.some(entry => entry.adapter === name)) {
                      return (
                        <td key={name} className={styles.cellDeclined} title="declined — see the scenario table">
                          ·
                        </td>
                      );
                    }
                    if (row === undefined || (cleanOnly && !isClean(row))) {
                      const failed = table?.problems.some(problem => problem.adapter === name);
                      return (
                        <td key={name} className={styles.cellEmpty}>
                          {failed ? '✗' : ''}
                        </td>
                      );
                    }
                    const slowdown = fastest === undefined ? 1 : row.ms / fastest.ms;
                    return (
                      <td
                        key={name}
                        className={clsx(
                          styles.cell,
                          isAnchor(name) ? styles.toneNeutral : toneOf(slowdown, row === fastest),
                          row === fastest && styles.winner,
                          !isClean(row) && styles.hatched,
                        )}
                        onMouseMove={event =>
                          setHover({x: event.clientX, y: event.clientY, scenario: scenario.key, adapter: name, row})
                        }
                        onMouseLeave={() => setHover(undefined)}>
                        {formatSlowdown(row, slowdown, row === fastest)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hover !== undefined && <Tooltip hover={hover} />}
      {scenarioHover !== undefined && <ScenarioTooltip hover={scenarioHover} point={point} />}
    </div>
  );
}
