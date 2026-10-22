import { useState, type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import Reveal from './Reveal';
import styles from './LandingMemory.module.css';

type TScreen = 'Chat' | 'Members';

const SCREENS: readonly TScreen[] = ['Chat', 'Members'];

const POLICIES: readonly string[] = [
    'As soon as nothing reads it',
    'A grace period after the last reader leaves',
    'After N ms idle',
    'A time to live after the last write',
    'Whichever comes first',
    'Keep while it holds data (default)',
];

type TQuestion = {
    text: string;
    source: string;
    href: string;
};

type TApproach = {
    name: string;
    text: string;
    isOurs?: boolean;
};

const QUESTIONS: readonly TQuestion[] = [
    {
        text: 'How to reset state properly?',
        source: 'zustand, discussion #1869',
        href: 'https://github.com/pmndrs/zustand/discussions/1869',
    },
    {
        text: 'Clear/Reset State After User Sign Out',
        source: 'zustand, discussion #574',
        href: 'https://github.com/pmndrs/zustand/discussions/574',
    },
    {
        text: 'Memory Leak Leading to OOM … Zustand Store Cleanup Issue',
        source: 'next.js, discussion #86820',
        href: 'https://github.com/vercel/next.js/discussions/86820',
    },
];

const APPROACHES: readonly TApproach[] = [
    {
        name: 'Redux, zustand',
        text: 'Nothing is dropped until you write a reset, and the reset clears shared state for every screen at once.',
    },
    {
        name: 'Jotai atomFamily',
        text: 'The family keeps every atom it has created until you call remove or setShouldRemove, and its docs warn about the memory leak.',
    },
    {
        name: 'TanStack Query, RTK Query',
        text: 'A query nobody reads is freed, but an entity fetched by five queries is stored five times.',
    },
    {
        name: 'Relay, Apollo',
        text: 'Relay frees data no query retains, for GraphQL data only; with Apollo you call cache.evict() and cache.gc() yourself.',
    },
    {
        name: 'OIMDB',
        text: 'Each entity is stored once, whatever source it came from. Lists, sorted views and computed values go when nothing reads them; entities go by the policy you set per collection: when unused, after a grace period, after idle time, or a time to live.',
        isOurs: true,
    },
];

const CODE_TODAY = `// users arrive from the chat socket, the members query and search,
// into one global slice that outlives every component
const readers = new Map<string, number>();
const dropTimers = new Map<string, ReturnType<typeof setTimeout>>();

function useUser(id: string) {
  useEffect(() => {
    clearTimeout(dropTimers.get(id));
    readers.set(id, (readers.get(id) ?? 0) + 1);
    return () => {
      const left = readers.get(id)! - 1;
      readers.set(id, left);
      if (left > 0) return;
      dropTimers.set(id, setTimeout(() => {
        readers.delete(id);
        store.dispatch(usersSlice.actions.removeOne(id));
      }, 30_000));
    };
  }, [id]);
  return useSelector((state) => state.users.entities[id]);
}`;

const CODE_OIMDB = `const userService = createOIMEntityService<User>(db, {
  keyOf: (user) => user.id,
  slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 30_000 }),
});
const users = userService.createStoreSlot(db);

function useUser(id: string) {
  return useOIMEntity(userService, users, id);
}`;

const statusLine = (openScreens: readonly TScreen[]): string => {
    if (openScreens.length === SCREENS.length) return 'Both screens show the user.';
    if (openScreens.length === 0) return 'No screen shows the user, so OIMDB drops it after 30 s idle.';
    return `${openScreens[0]} still shows the user, so it stays.`;
};

function ReaderCount(): ReactNode {
    const [openScreens, setOpenScreens] = useState<readonly TScreen[]>(SCREENS);
    const readerCount = openScreens.length;
    const isReleased = readerCount === 0;
    const toggleScreen = (screen: TScreen): void =>
        setOpenScreens(current =>
            current.includes(screen)
                ? current.filter(candidate => candidate !== screen)
                : SCREENS.filter(candidate => candidate === screen || current.includes(candidate)),
        );
    return (
        <div className={styles.counter}>
            <div className={styles.counterScreens}>
                {SCREENS.map(screen => {
                    const isOpen = openScreens.includes(screen);
                    return (
                        <button
                            key={screen}
                            type="button"
                            aria-pressed={isOpen}
                            className={clsx(styles.screen, isOpen && styles.screenOpen)}
                            onClick={() => toggleScreen(screen)}
                        >
                            <span className={styles.screenDot} aria-hidden="true" />
                            {screen}
                            <span className={styles.screenAction}>{isOpen ? 'Close' : 'Open'}</span>
                        </button>
                    );
                })}
            </div>
            <div className={clsx(styles.slot, isReleased && styles.slotReleased)}>
                <code className={styles.slotName}>users · u42</code>
                <span className={styles.slotCount}>{readerCount}</span>
                <span className={styles.slotUnit}>
                    {readerCount === 1 ? 'reader' : 'readers'}
                </span>
            </div>
            <p className={styles.counterStatus} aria-live="polite">{statusLine(openScreens)}</p>
        </div>
    );
}

export default function LandingMemory(): ReactNode {
    return (
        <section className={styles.section}>
            <div className="container">
                <Reveal>
                    <p className={styles.eyebrow}>Memory management</p>
                    <h2 className={styles.heading}>No manual state cleanup.</h2>
                    <p className={styles.lead}>
                        Data in an app arrives from several queries, sockets and local edits. With a plain store,
                        you write the code that clears it.
                    </p>
                </Reveal>
                <div className={styles.questions}>
                    {QUESTIONS.map((question, at) => (
                        <Reveal key={question.href} delayMs={at * 90}>
                            <a className={styles.question} href={question.href} target="_blank" rel="noreferrer">
                                <span className={styles.questionText}>“{question.text}”</span>
                                <span className={styles.questionSource}>{question.source}</span>
                            </a>
                        </Reveal>
                    ))}
                </div>
                <Reveal className={styles.compare}>
                    {APPROACHES.map(approach => (
                        <div
                            key={approach.name}
                            className={clsx(styles.compareRow, approach.isOurs === true && styles.compareRowOurs)}
                        >
                            <span className={styles.compareName}>{approach.name}</span>
                            <span className={styles.compareText}>{approach.text}</span>
                        </div>
                    ))}
                </Reveal>
                <div className={styles.grid}>
                    <Reveal from="left" className={styles.card}>
                        <span className={styles.labelToday}>Without OIMDB</span>
                        <CodeBlock language="ts">{CODE_TODAY}</CodeBlock>
                    </Reveal>
                    <Reveal from="right" className={clsx(styles.card, styles.cardOurs)}>
                        <span className={styles.labelOurs}>With OIMDB</span>
                        <CodeBlock language="ts">{CODE_OIMDB}</CodeBlock>
                        <ReaderCount />
                    </Reveal>
                </div>
                <Reveal className={styles.policies}>
                    <div className={styles.policiesText}>
                        <h3 className={styles.policiesTitle}>Entities go by the policy you set.</h3>
                        <p className={styles.policiesBody}>
                            Pick, per collection, when an entity nobody reads is dropped. A timed policy costs
                            nothing until you turn it on, and <code>holdSlotByKey(key)</code> keeps a key alive while
                            a request is in flight.
                        </p>
                        <Link className={styles.more} to="/docs/core/lifecycle">Lifecycle docs →</Link>
                    </div>
                    <ul className={styles.policyList}>
                        {POLICIES.map(policy => (
                            <li key={policy} className={styles.policy}>{policy}</li>
                        ))}
                    </ul>
                </Reveal>
            </div>
        </section>
    );
}
