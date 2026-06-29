// test/heir-ownership.test.js
// Unit tests for the HEIR_OWNED filter helpers that extension.js requires
// from lib/heir-ownership.js. Closes the gap shipped 2026-06-29 where the
// 2026-06-10 install-side filter (in lib/edition-install.js) passed 98
// unit tests but was never called by the production extension.js copy
// loops. These tests target the helpers that ARE called by cmdBootstrap +
// cmdUpgrade.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathMatchesAny, shouldSkipForHeirOwnership } = require('../lib/heir-ownership');

// Snapshot of Edition v3.6.2 _registry.cjs HEIR_OWNED list, with the
// patterns the leak class touched (workflows + dependabot + ISSUE_TEMPLATE)
// plus representative `local/` namespaces.
const HEIR_OWNED_GLOBS = [
    '.github/.act-heir.json',
    '.github/copilot-instructions.local.md',
    '.github/config/cognitive-config.json',
    '.github/config/local/**',
    '.github/instructions/local/**',
    '.github/skills/local/**',
    '.github/prompts/local/**',
    '.github/scripts/local/**',
    '.github/agents/local/**',
    '.github/episodic/**',
    '.github/workflows/**',
    '.github/ISSUE_TEMPLATE/**',
    '.github/dependabot.yml',
    '.vscode/extensions.json',
    '.vscode/settings.json',
];

const BOOTSTRAP_TEMPLATES = new Set([
    '.github/config/cognitive-config.json',
    '.vscode/extensions.json',
    '.vscode/settings.json',
]);

test('pathMatchesAny: directory-glob matches files inside', () => {
    assert.equal(pathMatchesAny('.github/workflows/brain-qa.yml', HEIR_OWNED_GLOBS), true);
    assert.equal(pathMatchesAny('.github/workflows/release-gate.yml', HEIR_OWNED_GLOBS), true);
});

test('pathMatchesAny: directory-glob matches the directory itself', () => {
    assert.equal(pathMatchesAny('.github/workflows', HEIR_OWNED_GLOBS), true);
});

test('pathMatchesAny: literal path matches exactly', () => {
    assert.equal(pathMatchesAny('.github/dependabot.yml', HEIR_OWNED_GLOBS), true);
});

test('pathMatchesAny: literal path does not match a different path', () => {
    assert.equal(pathMatchesAny('.github/dependabot.yaml', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/instructions/dependabot.yml', HEIR_OWNED_GLOBS), false);
});

test('pathMatchesAny: EDITION_OWNED paths do not match HEIR_OWNED globs', () => {
    assert.equal(pathMatchesAny('.github/instructions/act-pass.instructions.md', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/skills/critical-thinking/SKILL.md', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/prompts/meditate.prompt.md', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/agents/brain-auditor.agent.md', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/config/edition-manifest.json', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.github/VERSION', HEIR_OWNED_GLOBS), false);
    assert.equal(pathMatchesAny('.vscode/markdown-light.css', HEIR_OWNED_GLOBS), false);
});

test('pathMatchesAny: handles backslash-input by normalizing', () => {
    assert.equal(pathMatchesAny('.github\\workflows\\brain-qa.yml', HEIR_OWNED_GLOBS), true);
});

test('pathMatchesAny: empty patterns returns false', () => {
    assert.equal(pathMatchesAny('.github/workflows/brain-qa.yml', []), false);
});

test('pathMatchesAny: null patterns returns false', () => {
    assert.equal(pathMatchesAny('.github/workflows/brain-qa.yml', null), false);
});

test('pathMatchesAny: local/ namespace matches', () => {
    assert.equal(pathMatchesAny('.github/skills/local/my-skill/SKILL.md', HEIR_OWNED_GLOBS), true);
    assert.equal(pathMatchesAny('.github/instructions/local/foo.instructions.md', HEIR_OWNED_GLOBS), true);
});

// ── shouldSkipForHeirOwnership ───────────────────────────────────────────────

test('skip: returns false for EDITION_OWNED paths', () => {
    assert.equal(shouldSkipForHeirOwnership('.github/instructions/act-pass.instructions.md', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), false);
    assert.equal(shouldSkipForHeirOwnership('.github/skills/critical-thinking/SKILL.md', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), false);
});

test('skip: returns true for HEIR_OWNED-not-template paths (the leak class)', () => {
    // The actual leak — workflows + dependabot.yml were shipping to heirs.
    assert.equal(shouldSkipForHeirOwnership('.github/workflows/brain-qa.yml', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true);
    assert.equal(shouldSkipForHeirOwnership('.github/workflows/release-gate.yml', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true);
    assert.equal(shouldSkipForHeirOwnership('.github/dependabot.yml', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true);
    assert.equal(shouldSkipForHeirOwnership('.github/ISSUE_TEMPLATE/bug.md', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true);
    assert.equal(shouldSkipForHeirOwnership('.github/episodic/meditation-2026-01-01.md', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true);
});

test('skip: returns false for bootstrap-template paths (caller handles first-install semantics)', () => {
    // Bootstrap templates are HEIR_OWNED in classification but the helper
    // explicitly does NOT skip them — the caller's first-install-only
    // branch handles their write semantics.
    assert.equal(shouldSkipForHeirOwnership('.github/config/cognitive-config.json', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), false);
    assert.equal(shouldSkipForHeirOwnership('.vscode/extensions.json', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), false);
    assert.equal(shouldSkipForHeirOwnership('.vscode/settings.json', HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), false);
});

test('skip: returns false when heirOwnedPatterns is null (legacy Edition tags)', () => {
    // Before Edition v3.4.x the _registry.cjs did not export HEIR_OWNED.
    // Callers degrade by passing null; the function should no-op so the
    // install reverts to pre-v9.5.5 verbatim copy.
    assert.equal(shouldSkipForHeirOwnership('.github/workflows/brain-qa.yml', null, BOOTSTRAP_TEMPLATES), false);
    assert.equal(shouldSkipForHeirOwnership('.github/dependabot.yml', null, BOOTSTRAP_TEMPLATES), false);
});

test('skip: returns false when heirOwnedPatterns is empty array (defensive)', () => {
    assert.equal(shouldSkipForHeirOwnership('.github/workflows/brain-qa.yml', [], BOOTSTRAP_TEMPLATES), false);
});

test('skip: returns true when bootstrapTemplates is null (no template precedence)', () => {
    // Defensive: if the caller forgot to pass templates, the helper still
    // skips HEIR_OWNED-non-template paths. (Real callers always pass a Set.)
    assert.equal(shouldSkipForHeirOwnership('.github/workflows/brain-qa.yml', HEIR_OWNED_GLOBS, null), true);
});

test('skip: regression — the exact paths msft-career leaked', () => {
    // 2026-06-29 verification: msft-career heir on Extension v9.5.4 received
    // these three files. v9.5.5 must skip them in both cmdBootstrap and
    // cmdUpgrade paths.
    const leaked = [
        '.github/workflows/brain-qa.yml',
        '.github/workflows/release-gate.yml',
        '.github/dependabot.yml',
    ];
    for (const p of leaked) {
        assert.equal(shouldSkipForHeirOwnership(p, HEIR_OWNED_GLOBS, BOOTSTRAP_TEMPLATES), true, `should skip ${p}`);
    }
});
