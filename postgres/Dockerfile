FROM postgres:16.15-alpine3.24

# Keep Alpine security packages current and replace the upstream Go-based
# gosu helper with Alpine's tiny C-based su-exec implementation. Patch both
# official helper scripts so the vulnerable gosu path can be removed entirely.
RUN set -eux; \
    apk upgrade --no-cache; \
    apk add --no-cache su-exec; \
    sed -i 's/exec gosu postgres /exec su-exec postgres /g' \
      /usr/local/bin/docker-entrypoint.sh \
      /usr/local/bin/docker-ensure-initdb.sh; \
    ! grep -R -n 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-ensure-initdb.sh; \
    rm -f /usr/local/bin/gosu; \
    test ! -e /usr/local/bin/gosu; \
    su-exec nobody true
