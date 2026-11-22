// Keep reconciliation tests separate from other worktrees' Karma servers.
module.exports = function (config) {
  require('./karma.conf.js')(config);
  config.set({ port: 9879, captureTimeout: 120000, retryLimit: 0 });
};
