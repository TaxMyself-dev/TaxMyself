// Resolve the repository's emitted `src/...` imports when profiling compiled
// output directly. This changes module lookup only for the profiler child.
const Module = require('module');
const path = require('path');

const sourceRoot = process.env.STARTUP_PROFILE_DIST_SOURCE_ROOT;
if (!sourceRoot) {
  throw new Error('STARTUP_PROFILE_DIST_SOURCE_ROOT is required.');
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (request === 'src' || request.startsWith('src/')) {
    const relative = request === 'src' ? '' : request.slice(4);
    return originalResolveFilename.call(
      this,
      path.join(sourceRoot, relative),
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
