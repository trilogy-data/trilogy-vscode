# Trilogy LSP + VsCode Extension

## trilogy_language_server

Python based language server for the Trilogy language.

## editors/vscode

VSCode extension that bundles it.

## Development

### Running the VSCode Extension in Dev Mode

1. Install dependencies:
   ```bash
   cd editors/vscode
   pnpm install
   ```

2. Open the extension folder in VSCode:
   ```bash
   code editors/vscode
   ```

3. Press **F5** (or go to Run → Start Debugging)

This launches a new VSCode window (Extension Development Host) with the extension loaded. You can set breakpoints and debug from the original window.
