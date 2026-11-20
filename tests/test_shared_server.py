import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import api


class SharedServerTests(unittest.TestCase):
    def setUp(self):
        self.origin = "https://mercury-test.ngrok-free.dev"
        self.key = "test-only-proxy-key"
        self.enterContext(patch.multiple(api, SHARE_ORIGIN=self.origin,
                                         SHARE_HOST="mercury-test.ngrok-free.dev", SHARE_KEY=self.key))
        self.client = TestClient(api.app, base_url=self.origin)
        self.addCleanup(self.client.close)
        self.headers = {"X-Mercury-Share": self.key}

    def test_requests_must_arrive_through_the_authorized_proxy(self):
        path = "/api/analytics/catalog"
        self.assertEqual(self.client.get(path).status_code, 403)
        self.assertEqual(self.client.get(path, headers={**self.headers, "Host": "localhost"}).status_code, 403)
        self.assertEqual(self.client.get(path, headers=[*(self.headers.items()), ("X-Mercury-Share", "duplicate")]).status_code, 403)
        allowed = self.client.get(path, headers=self.headers)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers["Cache-Control"], "private, no-store")

    def test_public_mutations_require_same_origin_and_maintenance_stays_local(self):
        query = "/api/analytics/catalog/S1/execute"
        self.assertEqual(self.client.post(query, headers=self.headers).status_code, 403)
        self.assertEqual(self.client.post(query, headers={**self.headers, "Origin": "http://localhost"}).status_code, 403)
        same_origin = {**self.headers, "Origin": self.origin}
        with patch("analytics.execute", return_value={"test": True}):
            self.assertEqual(self.client.post(query, headers=same_origin).json(), {"test": True})
        for path in ("/api/setup/initialize", "/api/cube/process/"):
            response = self.client.post(path, headers=same_origin)
            self.assertEqual(response.json()["code"], "LOCAL_ONLY")
