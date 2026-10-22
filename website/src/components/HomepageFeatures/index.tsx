import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import Reveal from '@site/src/components/Landing/Reveal';
import styles from './styles.module.css';

type TFeature = {
    title: string;
    to: string;
    description: string;
    isWide?: boolean;
};

const FEATURES: TFeature[] = [
    {
        title: 'One copy of every entity',
        to: '/docs/core/collections',
        description: 'Each entity is stored once under its key. Edit it, and every list that shows it reads the new value.',
        isWide: true,
    },
    {
        title: 'Groups that update when a field changes',
        to: '/docs/core/oimindex',
        description: 'Group by any field. Change that field and the entity moves to its new group in the same write.',
    },
    {
        title: 'Sorted views that skip edits they don’t depend on',
        to: '/docs/core/oimindex',
        description: 'Sort a group by any fields. Editing a field the sort doesn’t use never triggers a re-sort.',
    },
    {
        title: 'Derived values that recompute only when an input changed',
        to: '/docs/core/computed-effects',
        description: 'Build a total or a filtered list from entities, groups or other derived values.',
    },
    {
        title: 'Subscribe to one field',
        to: '/docs/core/channel',
        description: 'Subscribe to one entity, or to one field of it. Ten writes in a batch still run the subscriber once.',
    },
    {
        title: 'Choose each collection’s strategy when you create it',
        to: '/docs/guides/performance',
        description: 'In-place or copy-on-write, set or ordered groups, how long unused entities live. Fixed at construction, so no call branches on it.',
    },
    {
        title: 'Survives a reload, renders on the server',
        to: '/docs/recipes',
        description: 'Persist to localStorage or IndexedDB and render on the server. UI bindings are included.',
    },
    {
        title: 'Single objects, not only collections',
        to: '/docs/core/object',
        description: 'Keep the signed-in user or the app settings as one object, with no id, and subscribe to a single field of it.',
    },
];

export default function HomepageFeatures(): ReactNode {
    return (
        <section className={styles.features}>
            <div className="container">
                <Reveal>
                    <p className={styles.eyebrow}>What’s included</p>
                    <h2 className={styles.statement}>The parts you’d otherwise write on top of your store.</h2>
                </Reveal>
                <div className={styles.grid}>
                    {FEATURES.map((feature, at) => (
                        <Reveal
                            key={feature.title}
                            delayMs={(at % 3) * 80}
                            className={clsx(styles.cell, feature.isWide === true && styles.cellWide)}
                        >
                            <Link to={feature.to} className={styles.card}>
                                <h3 className={styles.title}>{feature.title}</h3>
                                <p className={styles.text}>{feature.description}</p>
                                <span className={styles.more}>Learn more →</span>
                            </Link>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
