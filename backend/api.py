import asyncio
import csv
import io
import json
import os
import secrets
import shutil
import sqlite3
from contextlib import asynccontextmanager, closing
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from pathlib import PurePosixPath
from fastapi import FastAPI, File, Form, HTTPException, Query as Param, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

import analytics
import bootstrap
from db.conexion import conectar
from settings import DATA, MAX_BYTES
from ssas_client import CubeError, call
from storage import db, init, now, run_record, versions
from sync import connect_sql
from uploads import FILES, inspect

@asynccontextmanager
async def lifespan(_):
    init()
    yield

SHARE_ORIGIN = os.getenv("MERCURY_SHARE_ORIGIN", "")
SHARE_HOST = urlsplit(SHARE_ORIGIN).netloc
SHARE_KEY = os.getenv("MERCURY_SHARE_KEY", "")
MAINTENANCE_PATHS = {"/api/setup/initialize", "/api/cube/process"}

app = FastAPI(title="Mercury", lifespan=lifespan,
              docs_url=None if SHARE_ORIGIN else "/docs",
              redoc_url=None if SHARE_ORIGIN else "/redoc",
              openapi_url=None if SHARE_ORIGIN else "/openapi.json")

@app.middleware("http")
async def local_origin(request, next_handler):
    if SHARE_ORIGIN:
        keys = request.headers.getlist("x-mercury-share")
        if (not SHARE_KEY or request.headers.get("host", "").lower() != SHARE_HOST
                or len(keys) != 1 or not secrets.compare_digest(keys[0].encode(), SHARE_KEY.encode())):
            return JSONResponse({"code": "ACCESS", "message": "Abre Mercury desde el enlace autorizado."}, 403)
        if request.url.path.rstrip("/") in MAINTENANCE_PATHS:
            return JSONResponse({"code": "LOCAL_ONLY", "message": "Esta acción está disponible desde el equipo servidor."}, 403)
    elif request.url.hostname not in {"127.0.0.1", "localhost", "::1", "testserver"}:
        return JSONResponse({"code": "HOST", "message": "Dirección no autorizada."}, 403)
    if request.url.path == "/api/uploads/validate":
        length = request.headers.get("content-length", "")
        if not length.isdigit() or int(length) > MAX_BYTES * 2 + 65536:
            return JSONResponse({"code": "UPLOAD_SIZE", "message": "Se requieren dos archivos de máximo 40 MB."}, 413)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if (origin != SHARE_ORIGIN if SHARE_ORIGIN else
                origin and urlsplit(origin).hostname not in {"127.0.0.1", "localhost", "::1"}):
            return JSONResponse({"code": "ORIGIN", "message": "Origen no autorizado."}, 403)
    response = await next_handler(request)
    if SHARE_ORIGIN and request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "private, no-store"
    return response

@app.exception_handler(HTTPException)
async def http_error(_, exc):
    return JSONResponse({"code": f"HTTP_{exc.status_code}", "message": exc.detail}, exc.status_code)

@app.exception_handler(ValueError)
async def invalid(_, exc):
    return JSONResponse({"code": "INVALID", "message": str(exc)}, 422)

@app.exception_handler(CubeError)
async def cube_error(_, exc):
    return JSONResponse({"code": "CUBE_UNAVAILABLE", "message": str(exc)}, 503)

class RunRequest(BaseModel):
    id: UUID

class Widget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    title: str | None = Field(None, max_length=120)
    chart: str = Field(pattern="^(bar|horizontal|line|area|pie|donut|kpi|table|scatter|treemap|funnel|stack|percent|combo|gauge|heatmap|matrix|column3d)$")
    query: analytics.Query | None = None
    catalog: str | None = Field(None, pattern="^[SC][1-3]$")
    x: int = Field(ge=0, le=11)
    y: int = Field(ge=0, le=200)
    w: int = Field(ge=1, le=12)
    h: int = Field(ge=2, le=16)

class Dashboard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    widgets: list[Widget] = Field(default_factory=list, max_length=24)

def probe(connect):
    try:
        with closing(connect()) as conn:
            conn.cursor().execute("SELECT 1")
        return "Disponible"
    except Exception:
        return "Sin conexión"

@app.get("/api/health")
def health():
    snapshot = None
    try:
        snapshot = call("GET", "cube/status")
    except CubeError:
        pass
    with db() as conn:
        last = conn.execute("SELECT * FROM run WHERE state <> 'VALIDADA' ORDER BY created DESC LIMIT 1").fetchone()
        layers = versions(conn)
        published = conn.execute("SELECT published,programs FROM publication WHERE id=1").fetchone()
    return {"postgres": probe(conectar), "sqlServer": probe(connect_sql),
            "ssas": "Disponible" if snapshot else "Sin conexión o sin procesar",
            "versions": layers, "lastRun": run_record(last) if last else None,
            "setupReady": not SHARE_ORIGIN and bootstrap.configured(), "shared": bool(SHARE_ORIGIN),
            "publication": dict(published) if published else None,
            "published": bool(layers.get("cube")), "pending": layers.get("dw") != layers.get("cube")}

@app.get("/api/cube/status")
def cube_status():
    return health()

@app.get("/api/sources/schema")
def schema():
    return FILES

@app.get("/api/sources/template/{filename}")
def template(filename: str):
    if filename not in FILES:
        raise HTTPException(404, "Fuente desconocida.")
    book = Workbook()
    book.remove(book.active)
    for source in FILES[filename]:
        book.create_sheet(source["hoja"]).append(list(source["columnas"]))
    out = io.BytesIO()
    book.save(out)
    return Response(out.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@app.post("/api/uploads/validate")
async def validate(files: list[UploadFile] = File(...), sources: list[str] | None = Form(None)):
    roles = sources or [f.filename for f in files]
    if len(files) != 2 or len(roles) != 2 or set(roles) != set(FILES):
        raise HTTPException(422, "Selecciona un XLSX para Instituciones y otro para Programas.")
    if any(not file.filename or not file.filename.lower().endswith(".xlsx") for file in files):
        raise HTTPException(422, "El formato admitido es XLSX.")
    run_id = str(uuid4())
    path = DATA / "uploads" / run_id
    path.mkdir(parents=True)
    reports = []
    try:
        for file, role in zip(files, roles):
            target = path / role
            original = PurePosixPath(file.filename.replace(chr(92), "/")).name[:200]
            count = 0
            with target.open("wb") as out:
                while chunk := await file.read(1024 * 1024):
                    count += len(chunk)
                    if count > MAX_BYTES:
                        raise HTTPException(413, "Cada archivo puede pesar hasta 40 MB.")
                    out.write(chunk)
            report = await run_in_threadpool(inspect, target, role)
            reports.append(report | {"original": original})
        with db(True) as conn:
            conn.execute("INSERT INTO run(id,created,state,files) VALUES (?,?,?,?)",
                         (run_id, now(), "VALIDADA", json.dumps([r["original"] for r in reports])))
    except BaseException:
        shutil.rmtree(path, ignore_errors=True)
        raise
    return {"id": run_id, "files": reports}

def queue(id, retry=False):
    with db(True) as conn:
        row = conn.execute("SELECT * FROM run WHERE id=?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "No se encontró la corrida.")
        expected = "ERROR" if retry else "VALIDADA"
        if row["state"] != expected:
            raise HTTPException(409, "La corrida no está disponible para esta acción.")
        if retry and conn.execute(
            "SELECT 1 FROM run WHERE started>? AND (kind='load' OR checkpoint>=2) AND id<>? LIMIT 1",
            (row["started"], id)
        ).fetchone():
            raise HTTPException(409, "Una corrida posterior invalida este reintento.")
        try:
            conn.execute("UPDATE run SET state='EN_COLA', error=NULL, ended=NULL WHERE id=?", (id,))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Ya hay una corrida en curso.")
    return {"id": id, "state": "EN_COLA"}

@app.post("/api/runs", status_code=202)
def start(body: RunRequest):
    return queue(str(body.id))

@app.get("/api/runs")
def history(state: str | None = None, since: str = "", offset: int = Param(0, ge=0)):
    with db() as conn:
        rows = conn.execute("""SELECT * FROM run WHERE state <> 'VALIDADA'
            AND (? IS NULL OR state=?) AND created>=? ORDER BY created DESC LIMIT 50 OFFSET ?""",
            (state, state, since, offset))
        return [run_record(r) for r in rows]

@app.get("/api/runs/{id}")
def get_run(id: UUID):
    with db() as conn:
        row = conn.execute("SELECT * FROM run WHERE id=?", (str(id),)).fetchone()
    if not row:
        raise HTTPException(404, "No se encontró la corrida.")
    return run_record(row)

@app.get("/api/runs/{id}/events")
def events(id: UUID, request: Request):
    get_run(id)
    async def stream():
        last = ""
        while not await request.is_disconnected():
            job = await run_in_threadpool(get_run, id)
            current = json.dumps(job)
            if current != last:
                yield "data: " + current + "\n\n"
                last = current
            else:
                yield ": heartbeat\n\n"
            if job["state"] in ("ERROR", "COMPLETADA"):
                break
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

@app.post("/api/runs/{id}/retry", status_code=202)
def retry(id: UUID):
    return queue(str(id), retry=True)

@app.get("/api/runs/{id}/rejections")
def rejections(id: UUID):
    job = get_run(id)
    etl_id = job["detail"].get("etl_id")
    if not etl_id:
        raise HTTPException(404, "Todavía no hay un reporte para esta corrida.")
    from db.rechazos import consultar
    stream = io.StringIO()
    fields = ["tabla_origen", "motivo_rechazo", "codigo_snies", "codigo_institucion"]
    writer = csv.writer(stream)
    writer.writerow(fields)
    try:
        for row in consultar(etl_id, limite=10000):
            writer.writerow([analytics.safe(row.get(key)) for key in fields])
    except Exception:
        raise HTTPException(503, "No fue posible consultar los rechazos en PostgreSQL.")
    return Response(stream.getvalue().encode("utf-8-sig"), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="rechazos-mercury.csv"'})

@app.post("/api/setup/initialize", status_code=202)
def initialize():
    if not bootstrap.configured():
        raise HTTPException(409, "Configura SQLSERVER_ADMIN_CONNECTION para inicializar desde Mercury.")
    id = str(uuid4())
    with db(True) as conn:
        try:
            conn.execute("""INSERT INTO run(id,created,state,stage,files,kind)
                            VALUES (?, ?, 'EN_COLA', 'Configuración inicial', '[]', 'setup')""", (id, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Ya hay una corrida en curso.")
    return {"id": id, "state": "EN_COLA"}

@app.post("/api/cube/process", status_code=202)
def reprocess():
    id = str(uuid4())
    with db(True) as conn:
        v = versions(conn)
        if not v.get("sql") or v.get("dw") != v.get("sql"):
            raise HTTPException(409, "Primero sincroniza y verifica SQL Server.")
        try:
            conn.execute("""INSERT INTO run(id,created,state,checkpoint,files,kind)
                            VALUES (?,?,'EN_COLA',2,'[]','process')""", (id, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Ya hay una corrida en curso.")
    return {"id": id, "state": "EN_COLA"}

@app.get("/api/analytics/catalog")
def catalog():
    return [{"id": q, "label": label, "mdx": analytics.CATALOG[q]} for q, label in analytics.TITLES.items()]

class GuidedFilter(BaseModel):
    labels: list[str] = Field(default_factory=list, max_length=30)
    start: int | None = Field(None, ge=1900, le=2200)
    end: int | None = Field(None, ge=1900, le=2200)


@app.post("/api/analytics/catalog/{id}/execute")
def catalog_query(id: str, body: GuidedFilter | None = None):
    if id not in analytics.CATALOG:
        raise HTTPException(404, "Consulta desconocida.")
    params = None
    if body and (body.labels or body.start is not None or body.end is not None):
        if body.labels and id not in {"S1", "C1", "C2"}:
            raise ValueError("Ese análisis no admite el filtro de categoría.")
        if body.start is not None or body.end is not None:
            if id not in {"S2", "C3"} or body.start is None or body.end is None or body.start > body.end:
                raise ValueError("Rango de registro no válido para este análisis.")
        params = {"guided": True, "labels": body.labels, "range": [body.start, body.end]}
    return analytics.execute(id, analytics.CATALOG[id], 10000, params)


@app.get("/api/analytics/members/{dimension}")
def cube_members(dimension: str):
    return analytics.members(dimension)


@app.get("/api/analytics/metadata")
def metadata():
    return analytics.metadata()

@app.post("/api/analytics/query")
def query(body: analytics.Query):
    return analytics.execute("avanzada", analytics.build(body), body.limit, body.model_dump())

@app.post("/api/analytics/export")
def exports(body: analytics.ExportRequest):
    result = analytics.get_result(body.result_id)
    view = analytics.ViewFilter.model_validate(body.model_dump())
    content, media = analytics.export(result, view, body.format)
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="mercury.{body.format}"'})

def design(body):
    ids = set()
    for widget in body.widgets:
        if widget.id in ids or bool(widget.query) == bool(widget.catalog) or widget.x + widget.w > 12:
            raise ValueError("El diseño contiene gráficos o posiciones inválidos.")
        ids.add(widget.id)
        if widget.query:
            analytics.build(widget.query)
    return body.model_dump_json()

@app.get("/api/dashboards")
def dashboards():
    with db() as conn:
        return [{"id": id, **json.loads(config)} for id, config in conn.execute("SELECT id,config FROM dashboard")]

@app.post("/api/dashboards", status_code=201)
def create_dashboard(body: Dashboard):
    id = str(uuid4())
    with db(True) as conn:
        conn.execute("INSERT INTO dashboard VALUES (?,?)", (id, design(body)))
    return {"id": id, **body.model_dump()}

@app.get("/api/dashboards/{id}")
def dashboard(id: UUID):
    with db() as conn:
        row = conn.execute("SELECT config FROM dashboard WHERE id=?", (str(id),)).fetchone()
    if not row:
        raise HTTPException(404, "Dashboard desconocido.")
    return {"id": str(id), **json.loads(row[0])}

@app.put("/api/dashboards/{id}")
def update_dashboard(id: UUID, body: Dashboard):
    with db(True) as conn:
        if not conn.execute("UPDATE dashboard SET config=? WHERE id=?", (design(body), str(id))).rowcount:
            raise HTTPException(404, "Dashboard desconocido.")
    return {"id": str(id), **body.model_dump()}

@app.delete("/api/dashboards/{id}", status_code=204)
def delete_dashboard(id: UUID):
    with db(True) as conn:
        if not conn.execute("DELETE FROM dashboard WHERE id=?", (str(id),)).rowcount:
            raise HTTPException(404, "Dashboard desconocido.")
    return Response(status_code=204)
