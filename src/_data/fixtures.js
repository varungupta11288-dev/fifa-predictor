const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '..', 'data', 'fixtures');

module.exports = () => ({
  teams: JSON.parse(fs.readFileSync(path.join(dir, 'teams.json'))),
  groups: JSON.parse(fs.readFileSync(path.join(dir, 'groups.json'))),
  matches: JSON.parse(fs.readFileSync(path.join(dir, 'matches.json'))),
});
