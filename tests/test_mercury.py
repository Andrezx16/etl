import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openpyxl import Workbook, load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import analytics
import api
import storage
from fastapi.testclient import TestClient
from uploads import FILES, inspect

def workbook(filename, *, conflict=False, formula=False, second_row=False):
    book = Workbook()
    book.remove(book.active)
    for spec in FILES[filename]:
        sheet = book.create_sheet(spec["hoja"])
        headers = list(spec["columnas"])
        data = ["ACADÉMICO" if value in {"cargo","nombre","apellido","tipo_cobertura","departamento","municipio"} else 101
                for value in spec["columnas"].values()]
        sheet.append(headers)
        if formula:
            data[0] = "=1+1"
        sheet.append(data)
        if conflict and spec["hoja"] == "Instituciones":
            data[-1] = "otro"
            sheet.append(data)
        if second_row:
            sheet.append(data)
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()

class MercuryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        for target in ("storage.DATA", "api.DATA"):
            patcher = patch(target, root)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = self.enterContext(TestClient(api.app))

    def validate(self):
        response = self.client.post("/api/uploads/validate", files=[
            ("files", (name, workbook(name))) for name in FILES
        ])
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_validate_confirm_and_lock(self):
        first, second = self.validate(), self.validate()
        self.assertEqual(sum(len(f["sheets"]) for f in first["files"]), 4)
        self.assertEqual(self.client.get("/api/runs").json(), [])
        self.assertEqual(self.client.post("/api/runs", json={"id": first["id"]}).status_code, 202)
        self.assertEqual(self.client.post("/api/runs", json={"id": second["id"]}).status_code, 409)

    def test_workbook_conflict_and_formula(self):
        filename = "Instituciones.xlsx"
        path = Path(self.tmp.name) / filename
        path.write_bytes(workbook(filename, second_row=True))
        self.assertEqual(inspect(path, filename)["sheets"][0]["duplicates"], 1)
        path.write_bytes(workbook(filename, conflict=True))
        with self.assertRaisesRegex(ValueError, "clave repetida"):
            inspect(path, filename)
        path.write_bytes(workbook(filename, formula=True))
        with self.assertRaisesRegex(ValueError, "fórmula"):
            inspect(path, filename)

    def test_catalog_and_no_unpublished_result(self):
        items = self.client.get("/api/analytics/catalog").json()
        self.assertEqual({r["id"] for r in items}, {"C1","C2","C3","S1","S2","S3"})
        self.assertIn("WHERE", next(r["mdx"] for r in items if r["id"]=="C2"))
        self.assertEqual(self.client.post("/api/analytics/catalog/S2/execute").status_code, 503)

    def test_published_cache_survives_pending_sync(self):
        with storage.db(True) as c:
            c.executemany("INSERT INTO version VALUES (?,?)", [("cube","old"),("sql","old")])
        snapshot = {"columns":[{"key":"m0","type":"number","label":"Programas"}],
                    "rows":[{"m0":12}],"totalRows":1,"truncated":False}
        with patch("analytics.call", return_value=snapshot) as bridge:
            first = self.client.post("/api/analytics/catalog/S2/execute").json()
            self.assertEqual(first["cubeVersion"], "old")
            with storage.db(True) as c:
                c.execute("UPDATE version SET run_id='new' WHERE layer='sql'")
            cached = self.client.post("/api/analytics/catalog/S2/execute").json()
            self.assertEqual(cached["resultId"], first["resultId"])
            self.assertEqual(self.client.post("/api/analytics/catalog/S1/execute").status_code,503)
            self.assertEqual(bridge.call_count,1)

    def test_drill_uses_authorized_hierarchy(self):
        mdx = analytics.build(analytics.Query(dimension="anio", measures=["programas"], year=2020))
        self.assertIn("[Año-Trimestre-Mes-Fecha].[Mes].MEMBERS",mdx)
        self.assertIn("WHERE ([Sk Tiempo Registro Snies].[Año].&[2020])",mdx)

    def test_whitelist_and_dashboard_roundtrip(self):
        invalid = {"dimension":"[evil]", "measures":["programas"]}
        self.assertEqual(self.client.post("/api/analytics/query", json=invalid).status_code, 422)
        body = {"name":"Operación", "widgets":[{"id":"x","chart":"line","catalog":"S2","x":0,"y":0,"w":6,"h":6}]}
        result = self.client.post("/api/dashboards", json=body)
        self.assertEqual(result.status_code, 201, result.text)
        id = result.json()["id"]
        self.assertEqual(self.client.get("/api/dashboards/"+id).json()["widgets"][0]["catalog"], "S2")
        self.assertEqual(self.client.put("/api/dashboards/"+id,json={**body,"name":"Edición"}).status_code,200)
        self.assertEqual(self.client.delete("/api/dashboards/"+id).status_code,204)

    def test_export_uses_filtered_snapshot_and_safe_values(self):
        result = {"queryId":"S2","cubeVersion":"test","filtersApplied":{},"truncated":False,
                  "columns":[{"key":"d0","label":"Miembro"},{"key":"m0","label":"Cantidad"}],
                  "rows":[{"d0":"=1+1","m0":-5},{"d0":"Excluir","m0":8}]}
        view = analytics.ViewFilter(member="=1+1")
        xlsx, _ = analytics.export(result, view, "xlsx")
        book = load_workbook(io.BytesIO(xlsx))
        self.assertEqual(book["Datos"]["A2"].data_type,"s")
        self.assertEqual(book["Datos"]["B2"].value,-5)
        self.assertEqual(book["Datos"].max_row,2)
        csv, _ = analytics.export(result, view, "csv")
        self.assertNotIn(b"Excluir", csv)
        self.assertIn(b"'=1+1", csv)

if __name__ == "__main__":
    unittest.main()
