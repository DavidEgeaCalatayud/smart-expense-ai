"""Exercise free-tier configuration and real child-process shutdown without cloud access."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
spec = importlib.util.spec_from_file_location("free_runtime", ROOT / "deploy/render-free/start.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class FreeConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "APP_ENV": "staging", "APP_DEBUG": "false", "AUTH_COOKIE_SECURE": "true",
            "RENDER_EXTERNAL_URL": "https://finance-fixture.onrender.com",
            "DATABASE_URL": "postgresql://fixture:fixture@postgres/finance?sslmode=require&channel_binding=require",
            "JWT_SECRET": "fixture-value-at-least-32-bytes-long",
        }

    def test_uses_allocated_origin_and_authenticates_database_tls(self):
        actual = runtime.prepare_free_environment(self.env)
        self.assertEqual(actual["FRONTEND_ORIGIN"], self.env["RENDER_EXTERNAL_URL"])
        self.assertNotIn("FRONTEND_ORIGIN", self.env)
        query = parse_qs(urlsplit(actual["DATABASE_URL"]).query)
        self.assertEqual(query["sslmode"], ["verify-full"])
        self.assertEqual(query["sslrootcert"], ["/etc/ssl/certs/ca-certificates.crt"])
        self.assertEqual(query["channel_binding"], ["require"])
        self.assertEqual(actual["PORT"], "10000")

    def test_rejects_insecure_database_or_invalid_public_listener(self):
        for key, value in [("DATABASE_URL", "postgresql://fixture:fixture@postgres/finance?sslmode=disable"),
                           ("RENDER_EXTERNAL_URL", "http://finance-fixture.onrender.com"),
                           ("PORT", "8000"), ("PORT", "80"), ("PORT", "65536"), ("PORT", "10000;bad")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                runtime.prepare_free_environment({**self.env, key: value})

    def test_edge_keeps_limits_and_routes_with_loopback_upstream_and_unprivileged_paths(self):
        actual = runtime.render_nginx((ROOT / "frontend/nginx.conf").read_text(), "10000")
        self.assertEqual(actual.count("limit_req zone="), 5)
        self.assertIn("http://127.0.0.1:8000", actual)
        self.assertNotIn("http://backend:8000", actual)
        self.assertNotIn("user nginx;", actual)
        self.assertIn("listen 10000;", actual)
        self.assertIn("pid /tmp/nginx.pid;", actual)
        self.assertIn("proxy_set_header Host $host;", actual)
        self.assertIn("try_files $uri $uri/ /index.html;", actual)
        self.assertIn("X-Forwarded-Proto https;", actual)
        self.assertIn("Strict-Transport-Security", actual)
        self.assertNotIn("set_real_ip_from", actual)


class SupervisorTests(unittest.TestCase):
    def run_scenario(self, scenario):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = root / "child.py"
            child.write_text("""import signal, sys, time
from pathlib import Path
ready, stopped = map(Path, sys.argv[1:])
def stop(*args):
    stopped.write_text('stopped')
    raise SystemExit(0)
signal.signal(signal.SIGTERM, stop)
ready.write_text('ready')
while True: time.sleep(0.05)
""")
            ready, stopped = root / "ready", root / "stopped"
            failing = root / "failing.py"
            failing.write_text("import sys, time\nfrom pathlib import Path\nwhile not Path(sys.argv[1]).exists(): time.sleep(0.02)\nraise SystemExit(7)\n")
            commands = [[sys.executable, str(child), str(ready), str(stopped)]]
            if scenario == "failure":
                commands.append([sys.executable, str(failing), str(ready)])
            driver = root / "driver.py"
            driver.write_text(f"""import importlib.util, os, sys
sys.path.insert(0, {str(ROOT / 'backend')!r})
spec = importlib.util.spec_from_file_location('runtime', {str(ROOT / 'deploy/render-free/start.py')!r})
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
raise SystemExit(runtime.supervise({commands!r}, dict(os.environ)))
""")
            process = subprocess.Popen([sys.executable, str(driver)])
            try:
                deadline = time.monotonic() + 5
                while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(ready.exists(), "fixture child never started")
                if scenario == "termination":
                    process.send_signal(signal.SIGTERM)
                code = process.wait(timeout=5)
                self.assertEqual(code, 7 if scenario == "failure" else 0)
                self.assertEqual(stopped.read_text(), "stopped")
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=12)

    def test_child_failure_stops_its_sibling(self):
        self.run_scenario("failure")

    def test_sigterm_stops_and_reaps_children(self):
        self.run_scenario("termination")
