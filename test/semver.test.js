// @ts-check
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, compare, gte, strip } = require('../lib/semver');

test('parse: basic X.Y.Z', () => {
    assert.deepEqual(parse('1.2.3'), { major: 1, minor: 2, patch: 3, pre: [] });
});

test('parse: strips leading v', () => {
    assert.deepEqual(parse('v9.4.0'), { major: 9, minor: 4, patch: 0, pre: [] });
});

test('parse: pre-release', () => {
    assert.deepEqual(parse('1.0.0-rc.1'), { major: 1, minor: 0, patch: 0, pre: ['rc', '1'] });
});

test('parse: malformed returns null', () => {
    assert.equal(parse('not-semver'), null);
    assert.equal(parse('1.2'), null);
    assert.equal(parse(''), null);
    assert.equal(parse(/** @type {any} */ (null)), null);
});

test('compare: equal', () => {
    assert.equal(compare('1.2.3', '1.2.3'), 0);
});

test('compare: numeric ordering (CRITICAL: not lexical)', () => {
    // The whole point of using semver instead of string-compare:
    // lexically "2.0.10" < "2.0.9" (because "1" < "9"), but
    // semantically 2.0.10 > 2.0.9.
    assert.equal(compare('2.0.10', '2.0.9'), 1);
    assert.equal(compare('2.0.9', '2.0.10'), -1);
});

test('compare: across major/minor/patch', () => {
    assert.equal(compare('2.0.0', '1.99.99'), 1);
    assert.equal(compare('1.2.0', '1.1.99'), 1);
    assert.equal(compare('1.1.2', '1.1.1'), 1);
});

test('compare: pre-release < release at same X.Y.Z', () => {
    assert.equal(compare('1.0.0-rc.1', '1.0.0'), -1);
    assert.equal(compare('1.0.0', '1.0.0-rc.1'), 1);
});

test('compare: pre-release identifier ordering', () => {
    // numeric < numeric: numeric compare
    assert.equal(compare('1.0.0-rc.1', '1.0.0-rc.2'), -1);
    assert.equal(compare('1.0.0-rc.10', '1.0.0-rc.2'), 1);
    // numeric < alphanumeric
    assert.equal(compare('1.0.0-1', '1.0.0-alpha'), -1);
    // alpha ordering
    assert.equal(compare('1.0.0-alpha', '1.0.0-beta'), -1);
});

test('compare: v-prefix tolerated on either side', () => {
    assert.equal(compare('v1.2.3', '1.2.3'), 0);
    assert.equal(compare('v2.0.0', 'v1.9.9'), 1);
});

test('compare: malformed throws', () => {
    assert.throws(() => compare('not-semver', '1.0.0'), /malformed left operand/);
    assert.throws(() => compare('1.0.0', 'not-semver'), /malformed right operand/);
});

test('gte: matches compare', () => {
    assert.equal(gte('1.0.0', '1.0.0'), true);
    assert.equal(gte('1.0.1', '1.0.0'), true);
    assert.equal(gte('1.0.0', '1.0.1'), false);
    assert.equal(gte('2.0.10', '2.0.9'), true);
});

test('gte: malformed returns false (safe-refuse posture)', () => {
    assert.equal(gte('not-semver', '1.0.0'), false);
    assert.equal(gte('1.0.0', 'not-semver'), false);
});

test('strip: leading v removed', () => {
    assert.equal(strip('v1.2.3'), '1.2.3');
    assert.equal(strip('1.2.3'), '1.2.3');
});

// The load-bearing real-world scenario this whole file exists for:
test('min_extension_version gate: 9.4.0 heir vs 9.4.0 minimum → ok', () => {
    assert.equal(gte('9.4.0', '9.4.0'), true);
});

test('min_extension_version gate: 9.3.0 heir vs 9.4.0 minimum → refuse', () => {
    assert.equal(gte('9.3.0', '9.4.0'), false);
});

test('min_extension_version gate: 9.10.0 heir vs 9.4.0 minimum → ok (NOT lexical)', () => {
    assert.equal(gte('9.10.0', '9.4.0'), true);
});

test('min_extension_version gate: 10.0.0 heir vs 9.4.0 minimum → ok', () => {
    assert.equal(gte('10.0.0', '9.4.0'), true);
});
