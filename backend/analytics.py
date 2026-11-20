import csv
import io
import json
import re
from uuid import uuid4
from openpyxl import Workbook
from pydantic import BaseModel, Field
from settings import ROOT
from ssas_client import CubeError, call
from storage import db, now, versions

TITLES = {
    "S1": "Programas y matrícula por sector", "S2": "Programas registrados por año",
    "S3": "Pregrado y créditos por campo CINE", "C1": "Alta calidad por departamento",
    "C2": "Oferta de alta calidad en Nariño", "C3": "Tendencia y promedio móvil",
}
CATALOG = {}
for path in sorted((ROOT / "docs" / "mdx").glob("*.mdx")):
    original = path.read_text(encoding="utf-8-sig")
    matches = list(re.finditer(r"^-- ([SC][1-3])\.", original, re.M))
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(original)
        CATALOG[match[1]] = original[match.start():end].strip()

MEASURES = {
    "programas": ("Numero de Programas", "Número de programas"),
    "matricula": ("Costo Matricula Promedio", "Matrícula promedio"),
    "creditos": ("Creditos Promedio", "Créditos promedio"),
    "duracion": ("Duracion Promedio", "Duración promedio"),
    "vigencia": ("Vigencia Promedio", "Vigencia promedio"),
}
DIMENSIONS = {
    "anio": ("[Sk Tiempo Registro Snies].[Año]", "Año"),
    "anio_resolucion": ("[Sk Tiempo Resolucion].[Año]", "Año de resolución"),
    "sector": ("[Institucion].[Sector]", "Sector"),
    "departamento": ("[Ubicacion].[Departamento]", "Departamento"),
    "campo": ("[Area Conocimiento].[Cine f Amplio]", "Campo CINE"),
    "modalidad": ("[Modalidad].[Modalidad]", "Modalidad"),
    "nivel": ("[Modalidad].[Nivel Academico]", "Nivel académico"),
    "institucion": ("[Institucion].[Institucion]", "Institución"),
    "anio_ejecutoria": ("[Sk Tiempo Ejecutoria].[Año]", "Año de ejecutoria"),
    "estado": ("[Estado Calidad].[Estado Programa]", "Estado del programa"),
    "calidad": ("[Estado Calidad].[Reconocimiento Ministerio]", "Reconocimiento"),
    "municipio": ("[Ubicacion].[Municipio]", "Municipio"),
    "formacion": ("[Modalidad].[Nivel Formacion]", "Nivel de formación"),
    "nbc": ("[Area Conocimiento].[Nbc]", "Núcleo básico"),
    "codigo": ("[Programa].[Codigo Snies]", "Código SNIES"),
    "caracter": ("[Institucion].[Caracter Academico]", "Carácter académico"),

}
LAST_ANALYSIS_YEAR = 2026
YEAR_DIMENSIONS = {"anio", "anio_resolucion", "anio_ejecutoria"}


def axis_members(dimension):
    path = DIMENSIONS[dimension][0]
    level = path + "." + path.split(".")[-1] + ".MEMBERS"
    if dimension in YEAR_DIMENSIONS:
        return f"FILTER({level}, VBA!Val({path}.CURRENTMEMBER.NAME) <= {LAST_ANALYSIS_YEAR})"
    return level

class Query(BaseModel):
    dimension: str
    second: str | None = None
    measures: list[str] = Field(min_length=1, max_length=4)
    limit: int = Field(300, ge=1, le=2000)
    year: int | None = Field(None, ge=1900, le=2200)
    filters: dict[str, list[str]] = Field(default_factory=dict, max_length=14)
    start: int | None = Field(None, ge=1900, le=2200)
    end: int | None = Field(None, ge=1900, le=2200)
    date_role: str = "anio"
    order: str = "natural"

class ViewFilter(BaseModel):
    search: str = Field("", max_length=150)
    sort: str = Field("", max_length=10)
    descending: bool = False
    member: str = Field("", max_length=450)

class ExportRequest(ViewFilter):
    result_id: str
    format: str

def metadata():
    with db() as conn:
        live = bool(versions(conn).get("cube"))
    remote = None
    if live:
        try:
            remote = call("GET", "cube/metadata")
        except CubeError:
            pass
    hierarchies = {x.casefold() for x in remote["hierarchies"]} if remote else None
    measures = {x.casefold() for x in remote["measures"]} if remote else None
    return {
        "dimensions": [{"id": k, "label": v[1]} for k, v in DIMENSIONS.items()
                       if hierarchies is None or v[0].casefold() in hierarchies],
        "measures": [{"id": k, "label": v[1]} for k, v in MEASURES.items()
                     if measures is None or f"[Measures].[{v[0]}]".casefold() in measures],
        "source": "cube" if remote else "definition",
    }


def members(dimension):
    if dimension not in DIMENSIONS:
        raise ValueError("Dimensión fuera del catálogo.")
    result = execute("miembros:" + dimension,
                     f"SELECT {{[Measures].[Numero de Programas]}} ON 0, NON EMPTY {axis_members(dimension)} ON 1 FROM [Cubo_SNIES]", 2000)
    return [{"id": members[0], "label": str(row["d0"])}
            for row, members in zip(result["rows"], result["membersByRow"]) if members]


MEMBER_PATH = re.compile(r"(?:[.]?&?\[(?:[^\]\r\n]|\]\])*\])+")


def slice_for(query):
    selections = []
    for key, values in query.filters.items():
        if key not in DIMENSIONS or len(values) > 30:
            raise ValueError("Filtro fuera del catálogo o con demasiados miembros.")
        path = DIMENSIONS[key][0]
        if any(len(value) > 450 or not value.casefold().startswith(path.casefold() + ".") or not MEMBER_PATH.fullmatch(value) for value in values):
            raise ValueError("El miembro no pertenece al filtro seleccionado.")
        if values:
            items = ",".join('StrToMember("' + value.replace('"', '""') + '", CONSTRAINED)'
                             for value in dict.fromkeys(values))
            selections.append("{" + items + "}")
    if query.date_role not in YEAR_DIMENSIONS:
        raise ValueError("Rol de fecha desconocido.")
    if query.start is not None or query.end is not None:
        if query.start is None or query.end is None or query.start > query.end:
            raise ValueError("Especifica ambos años y un rango válido.")
        path = DIMENSIONS[query.date_role][0]
        level = path + "." + path.split(".")[-1]
        selections.append(f"FILTER({level}.MEMBERS, VBA!Val({path}.CURRENTMEMBER.NAME) >= {query.start} AND VBA!Val({path}.CURRENTMEMBER.NAME) <= {query.end})")
    cube = "[Cubo_SNIES]"
    for selection in selections:
        cube = f"(SELECT {selection} ON 0 FROM {cube})"
    return cube


def build(query):
    if (query.dimension not in DIMENSIONS and query.dimension != "total") or query.second and query.second not in DIMENSIONS:
        raise ValueError("La dimensión no pertenece al catálogo del cubo.")
    if query.second == query.dimension or len(set(query.measures)) != len(query.measures):
        raise ValueError("Selecciona dimensiones y medidas distintas.")
    if any(m not in MEASURES for m in query.measures):
        raise ValueError("La medida no pertenece al catálogo del cubo.")
    if query.order not in ("natural", "asc", "desc"):
        raise ValueError("Orden no disponible.")
    if query.year is not None and (query.dimension != "anio" or query.second):
        raise ValueError("El desglose mensual requiere el año de registro como eje único.")
    cube = slice_for(query)
    measures = ", ".join(f"[Measures].[{MEASURES[m][0]}]" for m in query.measures)
    if query.dimension == "total":
        if query.second or query.year:
            raise ValueError("El total no admite ejes.")
        return f"SELECT {{ {measures} }} ON 0 FROM {cube}"
    dimensions = [query.dimension] + ([query.second] if query.second else [])
    levels = [axis_members(d) for d in dimensions]
    axis = " * ".join(levels)
    where = ""
    if query.year is not None:
        axis = "[Sk Tiempo Registro Snies].[Año-Trimestre-Mes-Fecha].[Mes].MEMBERS"
        where = f" WHERE ([Sk Tiempo Registro Snies].[Año].&[{query.year}])"
    axis = f"NONEMPTY({axis}, {{ {measures} }})"
    if query.order != "natural":
        order = "BASC" if query.order == "asc" else "BDESC"
        first = measures.split(", ")[0]
        axis = f"ORDER({axis}, {first}, {order})"
    return f"SELECT {{ {measures} }} ON 0, HEAD({axis}, {query.limit + 1}) ON 1 FROM {cube}{where}"


def guided_rows(result, parameters):
    selected = parameters["labels"]
    start, end = parameters["range"]
    indexes = []
    for index, row in enumerate(result["rows"]):
        value = str(row.get("d0", ""))
        if selected and value not in selected:
            continue
        year = int(value) if value.isdecimal() else None
        if start is not None and (year is None or year < start):
            continue
        if end is not None and year is not None and year > end:
            continue
        indexes.append(index)
    result["rows"] = [result["rows"][i] for i in indexes]
    if "membersByRow" in result:
        result["membersByRow"] = [result["membersByRow"][i] for i in indexes]
    result["totalRows"] = len(indexes)
    return result


def execute(query_id, mdx, limit, parameters=None):
    if query_id in {"S2", "C3"}:
        selected = parameters or {"guided": True, "labels": [], "range": [None, None]}
        start, end = selected["range"]
        parameters = {**selected, "range": [start, min(end, LAST_ANALYSIS_YEAR) if end is not None else LAST_ANALYSIS_YEAR]}
    signature_parts = [query_id, parameters]
    custom_year_axis = (query_id == "avanzada" and parameters and parameters.get("year") is None
                        and YEAR_DIMENSIONS.intersection((parameters.get("dimension"), parameters.get("second"))))
    if custom_year_axis or query_id.removeprefix("miembros:") in YEAR_DIMENSIONS:
        signature_parts.append(["axis_year_cap", LAST_ANALYSIS_YEAR])
    with db() as conn:
        current = versions(conn)
        version = current.get("cube")
        if not version:
            raise CubeError("Carga los Excel y publica la primera versión del cubo.")
        signature = json.dumps(signature_parts, sort_keys=True)
        cached = conn.execute("SELECT config FROM result WHERE json_extract(config,'$.signature')=? AND json_extract(config,'$.cubeVersion')=? ORDER BY created DESC LIMIT 1",
                              (signature, version)).fetchone()
        if cached:
            return json.loads(cached[0])
        if current.get("sql") != version:
            raise CubeError("La nueva versión está pendiente de verificación. Esta consulta aún no tiene un resultado de la versión anterior.")
    result = call("POST", "mdx/execute", {"mdx": mdx, "limit": limit})
    if parameters and parameters.get("guided"):
        result = guided_rows(result, parameters)
    result.update(resultId=str(uuid4()), queryId=query_id, cubeVersion=version,
                  filtersApplied=parameters or {}, signature=signature)
    with db(True) as conn:
        current = versions(conn)
        if current.get("cube") != version or current.get("sql") != version:
            raise CubeError("La versión cambió durante la consulta. Vuelve a ejecutarla.")
        conn.execute("INSERT INTO result VALUES (?,?,?)",
                     (result["resultId"], now(), json.dumps(result, allow_nan=False)))
        conn.execute("DELETE FROM result WHERE id IN (SELECT id FROM result ORDER BY created DESC LIMIT -1 OFFSET 250)")
    return result

def get_result(result_id):
    with db() as conn:
        row = conn.execute("SELECT config FROM result WHERE id=?", (result_id,)).fetchone()
    if not row:
        raise ValueError("El resultado expiró. Ejecuta la consulta nuevamente.")
    return json.loads(row[0])

def export_rows(result, view):
    search = view.search.strip().lower()
    rows = [r for r in result["rows"]
            if (not search or any(search in str(v).lower() for v in r.values() if v is not None))
            and (not view.member or " / ".join(str(r[k]) for k in r if k.startswith("d")) == view.member)]
    if view.sort in {column["key"] for column in result["columns"]}:
        nonnull = [r for r in rows if r.get(view.sort) is not None]
        missing = [r for r in rows if r.get(view.sort) is None]
        rows = sorted(nonnull, key=lambda r: r[view.sort], reverse=view.descending) + missing
    return rows

def safe(value):
    if isinstance(value, str) and (value.startswith(("\t", "\r")) or value.lstrip().startswith(("=", "+", "-", "@"))):
        return "'" + value
    return value

def export(result, view, format):
    columns = result["columns"]
    labels = [safe(c["label"]) for c in columns]
    records = [[safe(r.get(c["key"])) for c in columns] for r in export_rows(result, view)]
    if format == "csv":
        out = io.StringIO()
        csv.writer(out).writerows([labels, *records])
        return out.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8"
    if format != "xlsx":
        raise ValueError("Formato no soportado.")
    book = Workbook(write_only=True)
    sheet = book.create_sheet("Datos")
    for row in [labels, *records]:
        sheet.append(row)
    info = book.create_sheet("Metadatos")
    for key, value in {
        "Consulta": result["queryId"], "Versión": result["cubeVersion"],
        "Filtros": json.dumps(result["filtersApplied"] | view.model_dump(), ensure_ascii=False),
        "Fecha UTC": now(), "Truncado": result["truncated"],
    }.items():
        info.append([key, safe(value)])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
