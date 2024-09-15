glob = require("glob");
const x = './src/test/grammar/*.test.preql';

const rawTestCases = glob.sync(x)

console.log(rawTestCases)