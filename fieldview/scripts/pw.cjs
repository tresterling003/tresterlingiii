// Resolve Playwright from the project, or from a global install.
const path = require('path');
const { execSync } = require('child_process');
try {
  module.exports = require('playwright');
} catch {
  const root = execSync('npm root -g').toString().trim();
  module.exports = require(path.join(root, 'playwright'));
}
