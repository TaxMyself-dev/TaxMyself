const base = require('./karma.conf.js');
module.exports = config => {
  base(config);
  config.set({ port: 9893, browsers: ['ChromeHeadless'], singleRun: true, autoWatch: false });
};
