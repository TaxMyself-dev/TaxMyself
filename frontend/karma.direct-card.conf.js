module.exports = function (config) {
  require('./karma.conf.js')(config);
  config.set({ port: 9889, browsers: ['ChromeHeadless'], singleRun: true, autoWatch: false });
};
