// node scripts/check-version-bumped.mjs --staged | --pushed
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGED = process.argv.includes('--staged');
const SHIPPED_FILES = new Set(['README.md', 'CHANGELOG.md']);
const SHIPPED_DIRS = ['src/', 'bin/', 'ui/'];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

const readPackageJsonAt = (revision, dir) => {
    try {
        return JSON.parse(git('show', `${revision}:packages/${dir}/package.json`));
    } catch {
        return undefined;
    }
};

const commitThatSetVersion = (dir, version) => {
    const commits = git('log', '--format=%H', '--', `packages/${dir}/package.json`).split('\n').filter(Boolean);
    for (const commit of commits) {
        if (readPackageJsonAt(commit, dir)?.version !== version) continue;
        if (readPackageJsonAt(`${commit}^`, dir)?.version !== version) return commit;
    }
    return undefined;
};

const isShipped = path => {
    if (/(^|\/)tests\//.test(path) || /\.test\.[cm]?[jt]sx?$/.test(path)) return false;
    return SHIPPED_FILES.has(path) || SHIPPED_DIRS.some(shippedDir => path.startsWith(shippedDir));
};

const withoutVersion = packageJson => JSON.stringify({ ...packageJson, version: undefined, oimdbRelease: undefined });

const publishedVersions = name => {
    const out = execFileSync('npm', ['view', name, 'versions', '--json', '--prefer-online'], {
        stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const versions = JSON.parse(out);
    return Array.isArray(versions) ? versions : [versions];
};

const target = STAGED ? ':0' : 'HEAD';
const stale = [];
const unreachable = [];
const badPeers = [];

const packageJsons = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
    .map(entry => ({
        dir: entry.name,
        packageJson: readPackageJsonAt(target, entry.name)
            ?? JSON.parse(readFileSync(join(ROOT, 'packages', entry.name, 'package.json'), 'utf8')),
    }));
const localVersionByName = new Map(packageJsons.map(({ packageJson }) => [packageJson.name, packageJson.version]));

for (const { packageJson } of packageJsons) {
    if (packageJson.private || packageJson.oimdbRelease?.publish !== true) continue;
    for (const name of Object.keys(packageJson.dependencies ?? {})) {
        if (name.startsWith('@oimdb/')) badPeers.push(`${packageJson.name}: ${name} is a dependency; an @oimdb package is a peerDependency, so one copy is installed`);
    }
    for (const [name, range] of Object.entries(packageJson.peerDependencies ?? {})) {
        if (!name.startsWith('@oimdb/')) continue;
        const localVersion = localVersionByName.get(name);
        if (semver.validRange(range) === null || /^[*x]?$|latest|file:|workspace:|link:/.test(range.trim())) {
            badPeers.push(`${packageJson.name}: peer ${name}@"${range}" is not a concrete semver range`);
        } else if (localVersion !== undefined && !semver.satisfies(localVersion, range)) {
            badPeers.push(`${packageJson.name}: peer ${name}@"${range}" does not cover ${name}@${localVersion} in this repo`);
        }
    }
}

if (badPeers.length > 0) {
    console.error(`\nREFUSED: @oimdb peer ranges that would not install against this repo.\n\n${badPeers.map(line => `  ${line}`).join('\n')}\n`);
    process.exit(1);
}

for (const { dir, packageJson } of packageJsons) {
    if (packageJson.private || packageJson.oimdbRelease?.publish !== true) continue;
    const since = commitThatSetVersion(dir, packageJson.version);
    if (since === undefined) continue;
    const diffArgs = STAGED ? ['diff', '--cached', '--name-only', since] : ['diff', '--name-only', since, 'HEAD'];
    const changed = git(...diffArgs, '--', `packages/${dir}`).split('\n').filter(Boolean)
        .map(path => path.slice(`packages/${dir}/`.length))
        .filter(path => isShipped(path) || (path === 'package.json'
            && withoutVersion(readPackageJsonAt(since, dir)) !== withoutVersion(packageJson)));
    if (changed.length === 0) continue;
    let versions;
    try {
        versions = publishedVersions(packageJson.name);
    } catch {
        unreachable.push(packageJson.name);
        continue;
    }
    if (versions.includes(packageJson.version)) stale.push({ dir, packageJson, changed });
}

if (unreachable.length > 0) {
    const message = `check-version-bumped: npm did not answer for ${unreachable.join(', ')}; their versions were not checked.`;
    if (!STAGED) {
        console.error(`\n${message} Refusing to push without the check.\n`);
        process.exit(1);
    }
    console.warn(message);
}

if (stale.length > 0) {
    console.error('\nREFUSED: these packages changed what they ship, but their version is already on npm,'
        + ' so the release would skip them.\n');
    for (const { dir, packageJson, changed } of stale) {
        console.error(`  ${packageJson.name}@${packageJson.version} (packages/${dir})`);
        for (const path of changed.slice(0, 5)) console.error(`      ${path}`);
        if (changed.length > 5) console.error(`      … and ${changed.length - 5} more`);
    }
    console.error('\nBump each version above the highest one on npm, add its CHANGELOG line, and commit again.\n');
    process.exit(1);
}
