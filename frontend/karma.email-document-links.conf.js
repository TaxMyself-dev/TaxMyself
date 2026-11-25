module.exports = function (config) {
  require('./karma.conf.js')({
    set(options) { config.set({ ...options, port: 9893, reporters: ['progress'] }); }
  });
};
