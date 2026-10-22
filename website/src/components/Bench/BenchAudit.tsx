import type {ReactNode} from 'react';
import clsx from 'clsx';
import {GITHUB, auditEntries, benchResults, type AuditEntry} from './data';
import styles from './styles.module.css';

const STATE_TEXT: Record<AuditEntry['state'], string> = {
  current: 'audited against the current code',
  stale: 'the code changed after this audit',
  unstamped: 'written, not yet confirmed against the code',
  missing: 'not audited',
};

function Card({entry, heading, subtitle}: {entry: AuditEntry; heading: string; subtitle: string}): ReactNode {
  const card = entry.card;
  return (
    <section className={styles.card} id={entry.subject}>
      <h3>
        {heading}
        {card && <span className={clsx(styles.verdict, styles[`verdict_${card.verdict}`])}>{card.verdict}</span>}
        <span className={clsx(styles.auditState, styles[`audit_${entry.state}`])}>{STATE_TEXT[entry.state]}</span>
      </h3>
      <p className={styles.description}>{subtitle}</p>
      {card && (
        <>
          <p>{card.summary}</p>
          {card.models && (
            <p>
              <strong>Models:</strong> {card.models} <strong>Measures:</strong> {card.measures}
            </p>
          )}
          {card.wirings && (
            <div className={styles.scroll}>
              <table className={styles.results}>
                <tbody>
                  {Object.entries(card.wirings).map(([wiring, audit]) => (
                    <tr key={wiring}>
                      <td>
                        <code>{wiring}</code>
                      </td>
                      <td>
                        <span className={clsx(styles.verdict, styles[`verdict_${audit.verdict}`])}>{audit.verdict}</span>
                      </td>
                      <td>{audit.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(card.favours?.length ?? 0) > 0 && (
            <p>
              <strong>Favours:</strong> {card.favours?.join(' ')}
            </p>
          )}
          {(card.biases?.length ?? 0) > 0 && (
            <ul>
              {card.biases?.map(bias => (
                <li key={bias}>{bias}</li>
              ))}
            </ul>
          )}
          {(card.improvements?.length ?? 0) > 0 && (
            <>
              <strong>What would make it faster or more idiomatic</strong>
              <ul>
                {card.improvements?.map(improvement => (
                  <li key={improvement}>{improvement}</li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.note}>
            {card.auditedBy}, {card.auditedAt} — <a href={`${GITHUB}/${card.file}`}>full card with evidence</a>
          </p>
        </>
      )}
    </section>
  );
}

export function BenchParticipants(): ReactNode {
  return (
    <div className={styles.root}>
      {benchResults.participants.map(participant => {
        const entry = auditEntries.find(candidate => candidate.kind === 'participant' && candidate.subject === participant.name) ?? {
          subject: participant.name,
          kind: 'participant' as const,
          state: 'missing' as const,
          card: null,
        };
        return (
          <Card
            key={participant.name}
            entry={entry}
            heading={participant.version === '0' ? participant.name : `${participant.name} ${participant.version}`}
            subtitle={participant.admission}
          />
        );
      })}
      {benchResults.excluded.map(library => (
        <section key={library.name} className={styles.card}>
          <h3>
            {library.name} {library.version} <span className={styles.auditState}>not a participant</span>
          </h3>
          <p>{library.reason}</p>
        </section>
      ))}
    </div>
  );
}

export function BenchScenarios(): ReactNode {
  return (
    <div className={styles.root}>
      {benchResults.scenarios.map(scenario => {
        const entry = auditEntries.find(candidate => candidate.kind === 'scenario' && candidate.subject === scenario.key) ?? {
          subject: scenario.key,
          kind: 'scenario' as const,
          state: 'missing' as const,
          card: null,
        };
        return (
          <Card
            key={scenario.key}
            entry={entry}
            heading={`${scenario.label} (${scenario.key}, ${scenario.wiring}${scenario.floor ? ', floor' : ''})`}
            subtitle={scenario.description}
          />
        );
      })}
    </div>
  );
}
