"""Offline release configuration tests; no cloud resources or accounts needed."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("render_start", ROOT / "backend/deploy/render_start.py")
render_start = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render_start)


class RenderBackendTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "APP_ENV": "staging", "APP_DEBUG": "false", "AUTH_COOKIE_SECURE": "true",
            "FRONTEND_ORIGIN": "https://smart-expense-web.onrender.com/",
            "JWT_SECRET": "unit-test-generated-value-32-bytes-or-more",
            "DATABASE_URL": "postgresql://test:test@private-db:5432/test",
        }

    def test_derives_one_exact_host_and_normalizes_browser_origin(self):
        result = render_start.prepare_environment(self.env)
        self.assertEqual(result["FRONTEND_ORIGIN"], "https://smart-expense-web.onrender.com")
        self.assertEqual(result["ALLOWED_HOSTS"], "smart-expense-web.onrender.com,localhost,127.0.0.1")
        self.assertEqual(result["DATABASE_URL"], self.env["DATABASE_URL"])
        self.assertTrue(self.env["FRONTEND_ORIGIN"].endswith("/"))

    def test_rejects_incomplete_or_insecure_release_before_database_access(self):
        invalid = {
            "APP_ENV": ["development", "docker", ""], "APP_DEBUG": ["true", ""],
            "AUTH_COOKIE_SECURE": ["false", ""], "JWT_SECRET": ["short", ""],
            "DATABASE_URL": ["sqlite:///local.db", ""],
            "FRONTEND_ORIGIN": ["", "http://app.onrender.com", "https://localhost",
                                "https://api.example.invalid", "https://example.com",
                                "https://user:pass@app.onrender.com", "https://app.onrender.com/path",
                                "https://app.onrender.com?token=secret", "https://app.onrender.com#x"],
        }
        for key, values in invalid.items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    render_start.prepare_environment({**self.env, key: value})

    def test_failed_start_does_not_echo_secrets(self):
        result = subprocess.run(
            [os.sys.executable, str(ROOT / "backend/deploy/render_start.py"), "migrate"],
            env={**self.env, "FRONTEND_ORIGIN": "https://user:secret@app.onrender.com"},
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("user:secret", result.stderr)
        self.assertNotIn(self.env["DATABASE_URL"], result.stderr)
        self.assertNotIn(self.env["JWT_SECRET"], result.stderr)


class RenderEdgeTests(unittest.TestCase):
    def render(self, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nginx.conf"
            output.write_text("unchanged")
            result = subprocess.run(
                ["sh", str(ROOT / "frontend/render-entrypoint.sh"), str(ROOT / "frontend/nginx.conf"), str(output)],
                env={**os.environ, "DEPLOYMENT_TARGET": "render", "RENDER_BACKEND_HOST": "private-api-abcd",
                     "PORT": "10000", **overrides}, capture_output=True, text=True,
            )
            return result, output.read_text()

    def test_renders_managed_tls_proxy_and_keeps_auth_limits_and_nginx_variables(self):
        result, config = self.render()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("listen 10000;", config)
        self.assertIn("http://private-api-abcd:8000", config)
        self.assertNotIn("http://backend:8000", config)
        self.assertEqual(config.count("limit_req zone="), 5)
        self.assertIn("proxy_set_header Host $host;", config)
        self.assertIn("try_files $uri $uri/ /index.html;", config)
        self.assertIn("proxy_set_header X-Forwarded-Proto https;", config)
        self.assertIn("Strict-Transport-Security", config)
        self.assertNotIn("set_real_ip_from", config)

    def test_refuses_invalid_upstream_or_port_without_overwriting_config(self):
        for overrides in [{"RENDER_BACKEND_HOST": ""}, {"RENDER_BACKEND_HOST": "bad;host"},
                          {"RENDER_BACKEND_HOST": "bad\nhost"}, {"PORT": "0"},
                          {"PORT": "65536"}, {"PORT": "bad"}]:
            with self.subTest(overrides=overrides):
                result, config = self.render(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(config, "unchanged")

    def test_default_compose_path_is_unchanged(self):
        result, config = self.render(DEPLOYMENT_TARGET="")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(config, "unchanged")


if __name__ == "__main__":
    unittest.main()
