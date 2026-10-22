// Publishes the @oimdb packages that have declared themselves releasable and
// whose local version is NOT yet on npm. Idempotent: skips anything already
// published (so a re-run after a partial failure just continues), and publishes
// `@oimdb/core` first (dependents peer on it). Reads the registry with
// --prefer-online (npm's cache lies).
//
//   node scripts/publish-bumped.mjs            # publish what's bumped
//   node scripts/publish-bumped.mjs --dry-run  # print the plan, publish nothing
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run') || process.argv.includes('-n');

const packagesDir = join(ROOT, 'packages');
const candidates = readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
        try {
            const p = JSON.parse(
                readFileSync(join(packagesDir, d.name, 'package.json'), 'utf8')
            );
            return { dir: d.name, pkg: p };
        } catch {
            return null;
        }
    })
    .filter(
        c =>
            c &&
            c.pkg.name?.startsWith('@oimdb/') &&
            !c.pkg.private &&
            c.pkg.version
    );

// `private` says "this never leaves the repo". It cannot say "this ships, but
// not in this release" — which four packages say only in their `description`,
// where no script can read it. `oimdbRelease` is that second statement in a
// field. Undeclared is not a default: a package carrying neither `private` nor
// a well-formed gate stops the run, because the alternative is publishing
// something nobody decided to publish.
const undeclared = [];
for (const { dir, pkg } of candidates) {
    const gate = pkg.oimdbRelease;
    if (!gate || typeof gate !== 'object' || typeof gate.publish !== 'boolean') {
        undeclared.push(
            `packages/${dir}/package.json (${pkg.name}) — no "oimdbRelease": { "publish": <boolean> }`
        );
    } else if (gate.publish === false && !gate.why?.trim()) {
        undeclared.push(
            `packages/${dir}/package.json (${pkg.name}) — "publish": false with no "why"`
        );
    }
}
if (undeclared.length > 0) {
    console.error(
        '\nREFUSING TO PUBLISH: the release gate is undeclared or malformed on ' +
            `${undeclared.length} package(s).\n\n` +
            undeclared.map(m => `  ${m}`).join('\n') +
            '\n\nEvery non-private @oimdb/* package must state its own intent:\n' +
            '  "oimdbRelease": { "publish": true }\n' +
            '  "oimdbRelease": { "publish": false, "why": "<what has to happen first>" }\n' +
            'Add `"private": true` instead if the package never leaves the repo.\n'
    );
    process.exit(1);
}

const held = candidates.filter(c => !c.pkg.oimdbRelease.publish);
for (const { pkg } of held) {
    console.log(`HOLD    ${pkg.name}@${pkg.version} — ${pkg.oimdbRelease.why}`);
}

const pkgs = candidates
    .filter(c => c.pkg.oimdbRelease.publish)
    .map(c => ({
        name: c.pkg.name,
        version: c.pkg.version,
        peers: c.pkg.peerDependencies ?? {},
    }))
    // core first, then alphabetical (publish order matters only for consistency)
    .sort((a, b) =>
        a.name === '@oimdb/core'
            ? -1
            : b.name === '@oimdb/core'
              ? 1
              : a.name.localeCompare(b.name)
    );

const versionCache = new Map();
function publishedVersions(name) {
    if (versionCache.has(name)) return versionCache.get(name);
    let versions;
    try {
        const out = execSync(
            `npm view ${name} versions --json --prefer-online`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString();
        const v = JSON.parse(out);
        versions = Array.isArray(v) ? v : [v];
    } catch {
        versions = []; // never published (E404) → needs publishing
    }
    versionCache.set(name, versions);
    return versions;
}

const toPublish = [];
for (const p of pkgs) {
    const already = publishedVersions(p.name).includes(p.version);
    console.log(
        `${already ? 'skip    ' : 'PUBLISH '}${p.name}@${p.version}` +
            (already ? ' (already on npm)' : '')
    );
    if (!already) toPublish.push(p);
}

if (toPublish.length === 0) {
    console.log(
        pkgs.length === 0
            ? `\nNothing to publish — all ${held.length} releasable-candidate package(s) are on HOLD.`
            : '\nNothing to publish — every local version is already on npm.'
    );
    process.exit(0);
}

// A package whose `@oimdb/*` peer range matches nothing that will exist on npm
// after this run installs with an unsatisfiable peer. That happens the moment a
// dependency is on HOLD while its dependents are not — which is invisible in
// each manifest on its own and only shows up across the plan.
const unsatisfiable = [];
for (const p of toPublish) {
    for (const [dep, range] of Object.entries(p.peers)) {
        if (!dep.startsWith('@oimdb/')) continue;
        const planned = toPublish.find(q => q.name === dep);
        const available = [
            ...publishedVersions(dep),
            ...(planned ? [planned.version] : []),
        ];
        if (semver.maxSatisfying(available, range) === null) {
            const onNpm = publishedVersions(dep);
            unsatisfiable.push(
                `${p.name}@${p.version} peers on ${dep}@${range}; ` +
                    'nothing satisfying it will be on npm (highest published: ' +
                    `${onNpm.length ? semver.maxSatisfying(onNpm, '*') : 'nothing'})`
            );
        }
    }
}
if (unsatisfiable.length > 0) {
    console.error(
        '\nREFUSING TO PUBLISH: ' +
            `${unsatisfiable.length} unsatisfiable @oimdb peer range(s).\n\n` +
            unsatisfiable.map(m => `  ${m}`).join('\n') +
            '\n\nEither release the package the range points at (its ' +
            '"oimdbRelease" is likely { "publish": false }), or widen the range ' +
            'to one that is already on npm.\n'
    );
    process.exit(1);
}

if (DRY) {
    console.log(`\n--dry-run: would publish ${toPublish.length} package(s).`);
    process.exit(0);
}

for (const p of toPublish) {
    console.log(`\n=== npm publish ${p.name}@${p.version} ===`);
    execSync(`npm publish --workspace ${p.name} --access public`, {
        stdio: 'inherit',
    });
}
console.log('\nDone.');
