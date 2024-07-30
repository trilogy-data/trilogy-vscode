"use strict";
exports.__esModule = true;
exports.deactivate = exports.activate = void 0;
var net = require("net");
var path = require("path");
var vscode_1 = require("vscode");
var vscode_languageclient_1 = require("vscode-languageclient");
var client;
function getClientOptions() {
    return {
        // Register the server for plain text documents
        documentSelector: [
            { scheme: "file", language: "trilogy" },
            { scheme: "untitled", language: "trilogy" },
        ],
        outputChannelName: "[trilogy]"
    };
}
function isStartedInDebugMode() {
    return process.env.VSCODE_DEBUG_MODE === "true";
}
function startLangServerTCP(addr) {
    var serverOptions = function () {
        return new Promise(function (resolve, reject) {
            var clientSocket = new net.Socket();
            clientSocket.connect(addr, "127.0.0.1", function () {
                resolve({
                    reader: clientSocket,
                    writer: clientSocket
                });
            });
        });
    };
    return new vscode_languageclient_1.LanguageClient("tcp lang server (port " + addr + ")", serverOptions, getClientOptions());
}
function startLangServer(command, args, cwd) {
    var serverOptions = {
        args: args,
        command: command,
        options: { cwd: cwd }
    };
    return new vscode_languageclient_1.LanguageClient(command, serverOptions, getClientOptions());
}
function activate(context) {
    if (isStartedInDebugMode()) {
        // Development - Run the server manually
        client = startLangServerTCP(2087);
    }
    else {
        // Production - Distribute the LS as a separate package or within the extension?
        var cwd = path.join(__dirname);
        // get the vscode python.pythonPath config variable
        var pythonPath = vscode_1.workspace.getConfiguration("python").get("pythonPath");
        if (!pythonPath) {
            throw new Error("`python.pythonPath` is not set");
        }
        client = startLangServer(pythonPath, ["-m", "trilogy_language_server"], cwd);
    }
    context.subscriptions.push(client.start());
}
exports.activate = activate;
function deactivate() {
    return client ? client.stop() : Promise.resolve();
}
exports.deactivate = deactivate;
