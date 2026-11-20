"""Serve the compiled Mercury frontend and the API on the same origin."""
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import app
from settings import ROOT

dist = ROOT / "frontend" / "dist"
index = dist / "index.html"
if not index.is_file():
    raise RuntimeError("Compila la interfaz con npm.cmd --prefix frontend run build.")


@app.get("/app", include_in_schema=False)
@app.get("/app/", include_in_schema=False)
def application():
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
