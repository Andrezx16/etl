import argparse
import time
import httpx

p = argparse.ArgumentParser(description="Verificación de Mercury contra servicios locales.")
p.add_argument("--api", default="http://127.0.0.1:8000/api")
p.add_argument("--catalog", action="store_true", help="Requiere una versión del cubo publicada.")
p.add_argument("--upload", nargs=2, metavar=("INSTITUCIONES", "PROGRAMAS"))
a = p.parse_args()
with httpx.Client(base_url=a.api + "/", timeout=60) as client:
    def call(method, route, **kwargs):
        r = client.request(method, route, **kwargs)
        r.raise_for_status()
        return r.json()
    health = call("GET", "health")
    print({k: health[k] for k in ("postgres", "sqlServer", "ssas", "versions")})
    if a.upload:
        with open(a.upload[0], "rb") as institutions, open(a.upload[1], "rb") as programs:
            validated = call("POST", "uploads/validate", files=[
                ("files", ("Instituciones.xlsx", institutions)), ("files", ("Programas.xlsx", programs)),
            ])
        id = validated["id"]
        call("POST", "runs", json={"id": id})
        end = time.monotonic() + 3600
        while time.monotonic() < end:
            r = call("GET", "runs/" + id)
            print(r["state"], r["stage"])
            if r["state"] == "ERROR":
                raise SystemExit(r["error"])
            if r["state"] == "COMPLETADA":
                print(r["detail"].get("etl", {}).get("carga", {}).get("hecho"))
                break
            time.sleep(5)
        else:
            raise SystemExit("Se superó el tiempo de espera de verificación.")
    if a.catalog:
        for q in call("GET", "analytics/catalog"):
            result = call("POST", f"analytics/catalog/{q['id']}/execute", json={})
            print(q["id"], result["totalRows"], result["cubeVersion"])
