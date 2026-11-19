module.exports = config => {
  const originalSet = config.set.bind(config);
  config.set = options => originalSet({ ...options, port: 9881 });
  require('./karma.conf.js')(config);
};
