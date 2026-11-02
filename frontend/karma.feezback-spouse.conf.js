module.exports = config => {
  require('./karma.conf.js')(config);
  config.set({ port: 9877 });
};
