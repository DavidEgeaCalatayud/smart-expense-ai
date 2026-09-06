#!/bin/sh
set -eu

# Keep the existing local Docker Compose configuration unchanged.
[ "${DEPLOYMENT_TARGET:-}" = render ] || exit 0

backend_host="${RENDER_BACKEND_HOST:-}"
port="${PORT:-10000}"
case "$backend_host" in
  ''|*[!a-zA-Z0-9.-]*|.*|*.) echo 'A valid private RENDER_BACKEND_HOST is required' >&2; exit 1 ;;
esac
case "$port" in
  ''|*[!0-9]*|??????*) echo 'PORT must be a valid TCP port' >&2; exit 1 ;;
esac
[ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || {
  echo 'PORT must be between 1024 and 65535' >&2; exit 1;
}

source_config="${1:-/etc/nginx/render-source.conf}"
target_config="${2:-/etc/nginx/nginx.conf}"
# Substitute only validated deployment values. Do not expand Nginx variables
# such as $host, $uri or $request_id, and retain all five auth rate-limit routes.
sed \
  -e "s@http://backend:8000@http://$backend_host:8000@g" \
  -e "s/listen 80;/listen $port;/" \
  -e 's/X-Forwarded-Proto $scheme;/X-Forwarded-Proto https;/' \
  -e '/add_header X-Content-Type-Options/i\        add_header Strict-Transport-Security "max-age=31536000" always;' \
  "$source_config" > "$target_config"
