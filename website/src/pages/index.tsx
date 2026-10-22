import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import LiveDemo from '@site/src/components/LiveDemo';
import LandingSpeed from '@site/src/components/Landing/LandingSpeed';
import LandingMemory from '@site/src/components/Landing/LandingMemory';
import Reveal from '@site/src/components/Landing/Reveal';
import landingStyles from '@site/src/components/Landing/styles.module.css';

import styles from './index.module.css';

const HERO_CODE = `const taskService = createOIMEntityService<Task>(db, {
    keyOf: (task) => task.id,
});
const tasks = taskService.createStoreSlot(db);

const byColumnService = createOIMIndexService(db, {
    entityService: taskService,
    columns: ['column'],
});
const tasksByColumn = byColumnService.createIndexStoreSlot(tasks);

const byPriorityService = createOIMComputedServiceSorted({
    indexService: byColumnService,
    sortColumns: [{ column: 'priority', direction: 'asc' }],
});
const tasksByPriority = byPriorityService.createSortedStoreSlot(tasksByColumn);

taskService.slotContentService.updateEntity(
    taskService.getSlotByKey(tasks, 't1'), { title: 'Fix login redirect' },
);
db.flush();`;

function HomepageHeader(): ReactNode {
    return (
        <header className={styles.hero}>
            <div className={styles.glow} aria-hidden="true" />
            <div className={`container ${styles.heroInner}`}>
                <div className={styles.brand}>
                    <img className={styles.brandLogo} src={useBaseUrl('/img/logo.svg')} alt="" aria-hidden="true" />
                    <span className={styles.brandName}>OIMDB</span>
                </div>
                <p className={styles.kicker}>For apps that outgrew their store</p>
                <h1 className={styles.title}>
                    Powerful state.
                    <br />
                    <span className={styles.accent}>Native speed.</span>
                </h1>
                <p className={styles.subtitle}>
                    Collections, live indexes, always-sorted lists, computed values and automatic cleanup in the box,
                    at close to the cost of hand-written code on plain Maps and arrays. Subscriptions down to a single field.
                </p>
                <div className={styles.buttons}>
                    <Link className="button button--primary button--lg" to="/docs/getting-started/quick-start">
                        Get started
                    </Link>
                    <Link className={styles.ghost} to="/docs/benchmarks">
                        See the benchmarks →
                    </Link>
                </div>
                <Reveal className={styles.windowWrap}>
                    <div className={styles.window}>
                        <div className={styles.windowBar}>
                            <span /><span /><span />
                            <em>tasks.ts</em>
                        </div>
                        <CodeBlock language="ts">{HERO_CODE}</CodeBlock>
                    </div>
                </Reveal>
            </div>
        </header>
    );
}

function GranularSection(): ReactNode {
    return (
        <section className={landingStyles.demoSection}>
            <div className="container">
                <Reveal>
                    <p className={landingStyles.eyebrow}>Try it</p>
                    <h2 className={landingStyles.statement}>
                        Edit one field and only the cards that read it re-render.
                    </h2>
                    <p className={landingStyles.lead}>
                        Edit a task on the board below. Highlighted cards are the only ones that re-rendered.
                    </p>
                </Reveal>
                <Reveal>
                    <LiveDemo />
                </Reveal>
            </div>
        </section>
    );
}

function ClosingSection(): ReactNode {
    return (
        <section className={landingStyles.closing}>
            <div className="container">
                <Reveal>
                    <h2 className={landingStyles.closingTitle}>Next-level state management.</h2>
                    <p className={landingStyles.closingText}>
                        Install @oimdb/core, declare a collection, and subscribe to it from any component.
                    </p>
                    <div className={landingStyles.pairing}>
                        <p className={landingStyles.pairingLabel}>Recommended together with</p>
                        <a className={landingStyles.pairingName} href="https://cnstra.org/" target="_blank" rel="noopener noreferrer">
                            cnstra
                        </a>
                        <p className={landingStyles.pairingText}>
                            cnstra decides what happens and in what order. OIMDB holds the data and reacts to it.
                            One line connects them, and every turn of the orchestrator lands in one frame:
                        </p>
                        <code className={landingStyles.pairingCode}>cns.addDrainListener(() =&gt; db.flush());</code>
                        <Link className={landingStyles.pairingLink} to="/docs/guides/with-cnstra">
                            Using OIMDB with cnstra →
                        </Link>
                    </div>
                    <div className={styles.buttons} style={{ justifyContent: 'center' }}>
                        <Link className="button button--primary button--lg" to="/docs/getting-started/quick-start">
                            Get started
                        </Link>
                        <Link className={styles.ghost} to="/docs/core/how-it-works">
                            How it works →
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

export default function Home(): ReactNode {
    return (
        <Layout
            title="Powerful state. Native speed."
            description="OIMDB: collections, live indexes, always-sorted lists, computed values and automatic cleanup in the box, at close to the cost of hand-written code, with subscriptions down to a single field."
        >
            <HomepageHeader />
            <main>
                <HomepageFeatures />
                <LandingMemory />
                <LandingSpeed />
                <GranularSection />
                <ClosingSection />
            </main>
        </Layout>
    );
}
