const fs = require('fs');
const path = require('path');

module.exports = () => {
  const dir = path.join(__dirname, '..', '..', 'data', 'results');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .flatMap(f => {
      const day = f.replace('.json', '');
      const matches = JSON.parse(fs.readFileSync(path.join(dir, f)));
      return matches.map(m => ({ ...m, resultDay: day }));
    });
};
