"""Run the existing web edge and loopback-only API in one Free instance."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from deploy.render_start import prepare_environment


def prepare_free_environment(source: dict[str, str]) -> dict[str, str]:
    candidate = dict(source)
    # This is Render's assigned public URL, not a guessed/example hostname.
    candidate["FRONTEND_ORIGIN"] = source.get("FRONTEND_ORIGIN") or source.get("RENDER_EXTERNAL_URL", "")
    env = prepare_environment(candidate)
    port = source.get("PORT", "10000")
    if not port.isascii() or not port.isdecimal() or not 1024 <= int(port) <= 65535 or int(port) == 8000:
        raise ValueError("PORT must be a non-privileged TCP port other than the internal API port")
    env["PORT"] = str(int(port))
    parsed = urlsplit(env["DATABASE_URL"])
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if not parsed.hostname or not parsed.path.strip("/") or parsed.fragment:
        raise ValueError("DATABASE_URL must identify the external PostgreSQL host and database")
    if params.get("sslmode") not in {None, "require", "verify-full"}:
        raise ValueError("The external database requires authenticated TLS")
    # Authenticate the remote database, including its hostname, using the image's CA bundle.
    params.update(sslmode="verify-full", sslrootcert="/etc/ssl/certs/ca-certificates.crt", connect_timeout="15")
    env["DATABASE_URL"] = urlunsplit(parsed._replace(query=urlencode(params)))
    return env


def render_nginx(source: str, port: str) -> str:
    # port comes exclusively from prepare_free_environment's numeric validation.
    return (source
            .replace("user nginx;", "")
            .replace("worker_processes auto;", "worker_processes 1;")
            .replace("pid /var/run/nginx.pid;", "pid /tmp/nginx.pid;")
            .replace("/var/log/nginx/error.log", "/dev/stderr")
            .replace("/var/log/nginx/access.log", "/dev/stdout")
            .replace("http {", "http {\n    client_body_temp_path /tmp/nginx-client;\n    proxy_temp_path /tmp/nginx-proxy;\n    fastcgi_temp_path /tmp/nginx-fastcgi;\n    uwsgi_temp_path /tmp/nginx-uwsgi;\n    scgi_temp_path /tmp/nginx-scgi;")
            .replace("listen 80;", f"listen {port};")
            .replace("http://backend:8000", "http://127.0.0.1:8000")
            .replace("X-Forwarded-Proto $scheme;", "X-Forwarded-Proto https;")
            .replace('        add_header X-Content-Type-Options', '        add_header Strict-Transport-Security "max-age=31536000" always;\n        add_header X-Content-Type-Options'))


def supervise(commands: list[list[str]], env: dict[str, str]) -> int:
    """Stop both children on a signal or either child's exit; never serve a half-dead app."""
    stopping = False

    def request_stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    previous = {sig: signal.signal(sig, request_stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    children = []
    try:
        for command in commands:
            if stopping:
                return 0
            children.append(subprocess.Popen(command, env=env))
        while not stopping:
            for child in children:
                code = child.poll()
                if code is not None:
                    return code if code > 0 else 1
            time.sleep(0.1)
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        deadline = time.monotonic() + 10
        for child in children:
            try:
                child.wait(timeout=max(0.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def main() -> int:
    try:
        env = prepare_free_environment(dict(os.environ))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    config = Path("/tmp/smart-expense-nginx.conf")
    config.write_text(render_nginx(Path("nginx-source.conf").read_text(), env["PORT"]))
    # Free services have no pre-deploy command. Migrate before opening the public listener.
    # Errors are intentionally summarized; a driver exception could include connection details.
    for command in ([sys.executable, "-m", "alembic", "upgrade", "head"], ["nginx", "-t", "-c", str(config)]):
        result = subprocess.run(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            print("Release startup check failed: " + ("database migration" if "alembic" in command else "Nginx configuration"), file=sys.stderr)
            return 1
    return supervise([
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--workers", "1", "--no-access-log", "--no-proxy-headers"],
        ["nginx", "-c", str(config), "-g", "daemon off;"],
    ], env)


if __name__ == "__main__":
    raise SystemExit(main())
