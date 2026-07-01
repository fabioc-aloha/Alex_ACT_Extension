'use strict';

const assert = require('assert');
const test = require('node:test');
const Module = require('module');

let warningMessage = null;
let registered = [];
const vscodeStub = {
    window: {
        showWarningMessage: async (message) => {
            warningMessage = message;
            return undefined;
        },
        showErrorMessage: () => {},
        showInformationMessage: () => {},
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: 'C:/tmp/legacy-alexmaster' } }],
    },
    commands: {
        registerCommand: (id, handler) => {
            registered.push({ id, handler });
            return { dispose() {} };
        },
        executeCommand: async () => {},
    },
    ProgressLocation: { Notification: 1 },
    Uri: { file: (filePath) => ({ fsPath: filePath }) },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') return vscodeStub;
    return originalLoad.call(this, request, parent, isMain);
};

let migration;
try {
    migration = require('../migration');
} finally {
    Module._load = originalLoad;
}

test('migrateFromAlexMaster refuses with retired static-fetch message', async () => {
    warningMessage = null;
    await migration.migrateFromAlexMaster();

    assert.equal(warningMessage, migration.MIGRATION_RETIRED_MESSAGE);
});

test('checkActivationTrigger does not prompt for legacy migration', async () => {
    warningMessage = null;
    await migration.checkActivationTrigger({ workspaceState: { get: () => false, update: async () => {} } });

    assert.equal(warningMessage, null);
});

test('deprecated AlexMaster command stubs still register', () => {
    registered = [];
    migration.registerDeprecatedStubs({ subscriptions: [] });

    assert.equal(registered.length, migration.DEPRECATED_COMMANDS.length);
});
