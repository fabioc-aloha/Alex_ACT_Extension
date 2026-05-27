
module.exports = {
    window: {
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showTextDocument: async () => undefined,
        createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: '', tooltip: '', command: '' }),
        withProgress: async (_opts, fn) => fn({ report() {} }),
    },
    workspace: { workspaceFolders: undefined },
    commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
    Uri: { file: (p) => ({ fsPath: p }) },
    StatusBarAlignment: { Right: 2 },
    ProgressLocation: { Notification: 15 },
};
