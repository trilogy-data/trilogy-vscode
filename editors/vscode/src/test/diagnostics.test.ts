/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, activateTwo } from './helper';

suite('Should get diagnostics', () => {
    const docUri = getDocUri('diagnostics.preql');

    test('Diagnoses uppercase texts', async () => {
        await testDiagnostics(docUri, [
            { message: `Unexpected token ''. Expected one of:`, range: toRange(0, 7, 0, 8), severity: vscode.DiagnosticSeverity.Error, source: 'ex' },
        ]);
    });

    // test('Alt test Format', (done) => {
    //     activateTwo(docUri, done).then(() => {
    //         done();
    //     }
    //     ).catch((err) => {
    //         done(err);
    //     });
    // });
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
    const start = new vscode.Position(sLine, sChar);
    const end = new vscode.Position(eLine, eChar);
    return new vscode.Range(start, end);
}

async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
    if (!docUri) {
        throw new Error('The test path (docUri) is null or undefined. Please provide a valid document URI.');
    }
    await activate(docUri);

    const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

    assert.equal(actualDiagnostics.length, expectedDiagnostics.length);

    expectedDiagnostics.forEach((expectedDiagnostic, i) => {
        const actualDiagnostic = actualDiagnostics[i];
        assert.ok(
            actualDiagnostic.message.startsWith(expectedDiagnostic.message),
            `Expected diagnostic message to start with "${expectedDiagnostic.message}", but got "${actualDiagnostic.message}".`
        );
        assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
        assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
    });
}