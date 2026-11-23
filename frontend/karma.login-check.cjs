const base = require('./karma.conf.js');
module.exports = config => {
  base(config);
  config.set({customLaunchers:{ChromeHeadlessLocal:{base:'ChromeHeadless',flags:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}},browsers:['ChromeHeadlessLocal'],singleRun:true});
};
