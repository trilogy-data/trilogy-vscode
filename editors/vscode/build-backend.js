// build-pyinstaller.js
const { exec } = require('child_process');
const path = require('path');
const os = require('os')

const parentDir = path.resolve(__dirname, '..', '..')
// Replace 'your_script.py' with your actual Python script or entry point
const pythonScript = path.join(parentDir, 'trilogy_language_server/build_language_server.py');


const isWindows = os.platform() === 'win32';
const venvPath = isWindows
    ? path.join(parentDir, '.venv/Scripts/python.exe')  // Path for Windows
    : path.join(parentDir, '.venv/bin/python');  // Path for Linux and macOS

require('dotenv').config();
// this is set in CI
// but if you have a pyenv set will override
const pythonPath = process.env.pythonLocation;
const pyInstallerCommand = pythonPath ? `${pythonPath}/python ${pythonScript}` : `${venvPath} ${pythonScript}`;

exec(pyInstallerCommand, {env: {'pyenv': process.env.pyenv, 'pythonLocation': process.env.pythonLocation}}, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    console.error(`PyInstaller Errors:\n${stderr}`);
    throw error;
  }
  console.log(`PyInstaller Output:\n${stdout}`);
  
});