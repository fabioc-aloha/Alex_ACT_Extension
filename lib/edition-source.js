// @ts-check
'use strict';

/**
 * The Edition repository this Extension fetches its brain from.
 *
 * THIS IS THE ONLY EDITION-SPECIFIC VALUE IN THE EXTENSION.
 *
 * Changing this constant requires a full Extension republish to the
 * Marketplace. Everything else about Edition (current version, brain
 * content, manifest contract) is discovered at runtime via GitHub.
 *
 * See ADR-009 (Extension Brain Delivery — GitHub-Fetch as Sole Source):
 *   https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md
 */

const EDITION_REPO = Object.freeze({
    owner: 'fabioc-aloha',
    repo: 'Alex_ACT_Edition'
});

module.exports = { EDITION_REPO };
