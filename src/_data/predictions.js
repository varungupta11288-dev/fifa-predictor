const fs = require('fs');
const path = require('path');

// email + sourceFile are sensitive — strip before exposing to templates so they
// can never appear in the deployed HTML.
function stripSensitive({ email, sourceFile, ...rest }) {
  return rest;
}

module.exports = () => {
  const dir = path.join(__dirname, '..', '..', 'data', 'predictions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => stripSensitive(JSON.parse(fs.readFileSync(path.join(dir, f)))))
    .sort((a, b) => a.handle.localeCompare(b.handle));
};
