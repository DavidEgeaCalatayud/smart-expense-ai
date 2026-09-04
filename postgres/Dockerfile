FROM postgres:16.15-alpine3.24

# Keep Alpine security packages current and replace the upstream gosu binary,
# which is compiled with a vulnerable Go stdlib, with Alpine's tiny C-based
# su-exec implementation. su-exec is CLI-compatible with the user-switch form
# used by the official PostgreSQL entrypoint.
RUN set -eux; \
    apk upgrade --no-cache; \
    apk add --no-cache su-exec; \
    rm -f /usr/local/bin/gosu; \
    ln -s /sbin/su-exec /usr/local/bin/gosu; \
    gosu nobody true
