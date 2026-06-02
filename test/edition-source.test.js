// @ts-check
'use strict';

/**
 * Unit test for lib/edition-source.js.
 *
 * The whole point of this module is to be the SINGLE Edition-specific
 * value in the Extension (ADR-009). A test that pins the shape catches
 * accidental mutation — e.g., a refactor that adds a second top-level
 * field, or a typo in the owner/repo strings.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EDITION_REPO } = require('../lib/edition-source');

test('EDITION_REPO: shape is { owner, repo }', () => {
    assert.equal(typeof EDITION_REPO, 'object');
    assert.equal(typeof EDITION_REPO.owner, 'string');
    assert.equal(typeof EDITION_REPO.repo, 'string');
    // Exactly two fields — anything else expands the surface against the
    // ADR-009 "single Edition-specific value" claim and needs review.
    assert.deepEqual(Object.keys(EDITION_REPO).sort(), ['owner', 'repo']);
});

test('EDITION_REPO: points at the canonical Edition repo', () => {
    assert.equal(EDITION_REPO.owner, 'fabioc-aloha');
    assert.equal(EDITION_REPO.repo, 'Alex_ACT_Edition');
});

test('EDITION_REPO: is frozen (mutation refused)', () => {
    assert.equal(Object.isFrozen(EDITION_REPO), true);
    assert.throws(() => {
        /** @type {any} */ (EDITION_REPO).owner = 'attacker';
    }, /Cannot assign to read only property/);
});
