const fs = require('node:fs');

function saveRunState(file, state, initial = false) {
  if (!file) return;
  const text = JSON.stringify({version: 1, ...state});
  if (initial) fs.writeFileSync(file, text, {flag: 'wx'});
  else {
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, text, {flag: 'wx'});
    fs.renameSync(temp, file);
  }
}
module.exports = {saveRunState};
