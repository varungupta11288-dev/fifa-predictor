const fs = require('fs');
const path = require('path');

module.exports = () => {
  const dir = path.join(__dirname, '..', '..', 'data', 'predictions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f))))
    .sort((a, b) => a.handle.localeCompare(b.handle));
};
