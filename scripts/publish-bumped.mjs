// Publishes only the @oimdb packages whose local version is NOT yet on npm.
// Idempotent: skips anything already published (so a re-run after a partial
// failure just continues), and publishes `@oimdb/core` first (dependents peer
// on it). Reads the registry with --prefer-online (npm's cache lies).
//
//   node scripts/publish-bumped.mjs            # publish what's bumped
//   node scripts/publish-bumped.mjs --dry-run  # print the plan, publish nothing
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run') || process.argv.includes('-n');

const packagesDir = join(ROOT, 'packages');
const pkgs = readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
        try {
            const p = JSON.parse(
                readFileSync(join(packagesDir, d.name, 'package.json'), 'utf8')
            );
            return { name: p.name, version: p.version, private: !!p.private };
        } catch {
            return null;
        }
    })
    .filter(p => p && p.name?.startsWith('@oimdb/') && !p.private && p.version)
    // core first, then alphabetical (publish order matters only for consistency)
    .sort((a, b) =>
        a.name === '@oimdb/core'
            ? -1
            : b.name === '@oimdb/core'
              ? 1
              : a.name.localeCompare(b.name)
    );

function publishedVersions(name) {
    try {
        const out = execSync(
            `npm view ${name} versions --json --prefer-online`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString();
        const v = JSON.parse(out);
        return Array.isArray(v) ? v : [v];
    } catch {
        return []; // never published (E404) → needs publishing
    }
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
    console.log('\nNothing to publish — every local version is already on npm.');
    process.exit(0);
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
