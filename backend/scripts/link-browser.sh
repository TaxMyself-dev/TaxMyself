#!/bin/sh
# The API remains root for existing application requirements. Untrusted pages do not.
set -eu
umask 077
if [ "$(id -u)" = "0" ]; then
  for argument in "$@"; do
    case "$argument" in
      --user-data-dir=/tmp/puppeteer_dev_chrome_profile-*)
        profile=${argument#--user-data-dir=}
        [ -d "$profile" ] && [ ! -L "$profile" ] || exit 1
        chown node:node "$profile"
        ;;
    esac
  done
  exec su-exec node:node /usr/bin/chromium "$@"
fi
exec /usr/bin/chromium "$@"
