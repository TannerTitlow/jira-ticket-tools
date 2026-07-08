#!/usr/bin/env node

const { run } = require("../src/cli");

Promise.resolve(run(process.argv.slice(2))).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
