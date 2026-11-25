import json
import logging
import time
from contextlib import closing
from filelock import FileLock
from settings import DATA
from storage import db, init, now
from ssas_client import call, CubeError

log = logging.getLogger("mercury")

def patch(run_id, **values):
    with db(True) as conn:
        conn.execute("UPDATE run SET " + ", ".join(f"{key}=?" for key in values) + " WHERE id=?",
                     (*values.values(), run_id))

def advance(run_id, layer, cp, detail):
    with db(True) as conn:
        conn.execute("INSERT OR REPLACE INTO version VALUES (?,?)", (layer, run_id))
        conn.execute("UPDATE run SET checkpoint=?, detail=? WHERE id=?",
                     (cp, json.dumps(detail, default=str), run_id))

def execute(row):
    from etl.orquestador import ejecutar_etl
    from db.conexion import conectar
    from sync import SyncError, synchronize

    run_id, cp = row["id"], row["checkpoint"]
    detail = json.loads(row["detail"])
    phase = "ETL"
    def progress(event):
        label = event["descripcion"]
        detail.setdefault("events", []).append({"name": label, "state": event["estado"], "at": now()})
        patch(run_id, stage=label, detail=json.dumps(detail, default=str))

    try:
        if row["kind"] == "setup":
            from bootstrap import initialize
            def setup_progress(stage):
                nonlocal phase
                phase = stage
                patch(run_id, stage=stage)

            initialize(setup_progress)
            patch(run_id, state="COMPLETADA", stage="Infraestructura preparada", ended=now())
            return
        if cp < 1:
            patch(run_id, stage="ETL incremental")
            source_run = detail.get("source_run", run_id)
            result = ejecutar_etl(carpeta=DATA / "uploads" / source_run, al_progreso=progress)
            detail["etl_id"] = result.get("id_corrida")
            detail["etl_error_stage"] = (result.get("error") or {}).get("etapa")
            patch(run_id, detail=json.dumps(detail, default=str))
            if not result["ok"]:
                raise RuntimeError("ETL failed")
            detail["etl"] = result["resumen"]
            advance(run_id, "dw", 1, detail)
        phase = "SQL Server"
        if cp < 2:
            patch(run_id, stage="Sincronización y verificación de SQL Server")
            detail["sync"] = synchronize()
            advance(run_id, "sql", 2, detail)
        phase = "SSAS"
        patch(run_id, stage="Procesamiento completo de SSAS")
        # The same ID reconnects to an existing operation after a worker restart.
        call("POST", "cube/process", {"id": run_id})
        deadline = time.monotonic() + 3600
        while time.monotonic() < deadline:
            status = call("GET", f"cube/process/{run_id}")["state"]
            if status == "OK":
                break
            if status != "EN_PROCESO":
                raise CubeError("El procesamiento falló. Revisa el servicio SSAS.")
            time.sleep(2)
        else:
            raise CubeError("El procesamiento excedió el tiempo de espera.")
        patch(run_id, stage="Verificación MDX")
        result = call("GET", "cube/status")
        with closing(conectar()) as pg, pg.cursor() as cur:
            cur.execute("SELECT COALESCE(SUM(indicador_oferta), 0) FROM dw.hecho_oferta_programa")
            expected = cur.fetchone()[0]
        rows = result["rows"]
        if not rows or (rows[0]["m0"] or 0) != expected:
            raise CubeError("El indicador del cubo difiere del total de la bodega.")
        with db(True) as conn:
            version = conn.execute("SELECT run_id FROM version WHERE layer='sql'").fetchone()[0]
            published = now()
            detail["published_version"] = version
            conn.execute("INSERT OR REPLACE INTO version VALUES ('cube',?)", (version,))
            conn.execute("INSERT OR REPLACE INTO publication VALUES (1,?,?)", (published, expected))
            conn.execute("""UPDATE run SET checkpoint=3, state='COMPLETADA', stage='Publicado',
                            ended=?, detail=? WHERE id=?""", (published, json.dumps(detail, default=str), run_id))
    except Exception as exc:
        state = exc.args[0] if phase == "Preparar SQL Server" and exc.args else None
        log.error("Corrida %s, etapa %s, error %s, ODBC %s%s", run_id, phase, type(exc).__name__,
                  state if state in ("08001", "08004", "HYT00", "HYT01", "28000", "IM002", "42000") else "—", f" | {exc}" if isinstance(exc, SyncError) else "")
        message = str(exc) if isinstance(exc, (CubeError, SyncError)) else f"Falló {phase}. Revisa la conexión y la bitácora local."
        if state in ("08001", "08004", "HYT00", "HYT01"):
            message = f"SQL Server no aceptó la conexión (ODBC {state}). Comprueba que el motor esté iniciado y que SQLSERVER_ADMIN_CONNECTION apunte a la instancia correcta."
        elif state == "28000":
            message = "SQL Server rechazó el inicio de sesión. Revisa los permisos de la cuenta configurada."
        patch(run_id, state="ERROR", error=message, ended=now())

def main():
    init()
    with FileLock(str(DATA / "worker.lock"), timeout=0):
        with db(True) as conn:
            conn.execute("UPDATE run SET state='EN_COLA' WHERE state='EN_PROCESO'")
        while True:
            with db(True) as conn:
                row = conn.execute("SELECT * FROM run WHERE state='EN_COLA' ORDER BY created LIMIT 1").fetchone()
                if row:
                    conn.execute("UPDATE run SET state='EN_PROCESO', started=?, ended=NULL WHERE id=?",
                                 (now(), row["id"]))
            if row:
                execute(row)
            else:
                time.sleep(1)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
