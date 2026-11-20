import math
import unicodedata
from datetime import date
from zipfile import ZipFile
from openpyxl import load_workbook
from config.fuentes import FUENTES
from settings import MAX_ROWS
from etl.staging import CLAVE_ADMITE_VACIO
from etl.pie_snies import es_nota_snies

FILES = {item["archivo"]: [] for item in FUENTES}
for item in FUENTES:
    FILES[item["archivo"]].append(item)

def normalize(value):
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return unicodedata.normalize("NFC", str(value).strip()).casefold() if value is not None else ""

def inspect(path, filename):
    try:
        with ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(i.file_size for i in entries) > 220 * 1024 * 1024:
                raise ValueError("El contenido descomprimido supera el límite permitido.")
            if any("vbaproject" in i.filename.lower() for i in entries):
                raise ValueError("Los archivos con macros no se admiten.")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("El archivo no es un libro XLSX legible.") from exc

    with path.open("rb") as stream:
        try:
            book = load_workbook(stream, read_only=True, data_only=False, keep_links=False)
        except Exception as exc:
            raise ValueError("El archivo no es un libro XLSX legible.") from exc
        sheets = []
        try:
            for spec in FILES[filename]:
                name = spec["hoja"]
                if name not in book.sheetnames:
                    raise ValueError(f"Falta la hoja {name}.")
                sheet = book[name]
                if (sheet.max_column or 0) > 256:
                    raise ValueError(f"{name}: demasiadas columnas.")
                rows = sheet.iter_rows()
                headers = [str(cell.value).strip() if cell.value is not None else None for cell in next(rows, ())]
                required = list(spec["columnas"])
                invalid = [col for col in required if headers.count(col) != 1]
                if invalid:
                    raise ValueError(f"{name}: encabezados ausentes o repetidos: {', '.join(invalid)}.")
                indexes = [headers.index(col) for col in required]
                keys = [list(spec["columnas"].values()).index(key) for key in spec["clave"]]
                optional = CLAVE_ADMITE_VACIO.get(spec["tabla_staging"], set())
                required_keys = [j for j, field in enumerate(spec["clave"]) if field not in optional]
                seen, preview = {}, []
                total = duplicates = notes = 0
                for index, cells in enumerate(sheet.iter_rows(min_row=2, max_col=len(headers)), 2):
                    if index > MAX_ROWS + 1:
                        raise ValueError(f"{name}: se superó el máximo de filas.")
                    used = [cells[i] for i in indexes]
                    if any(cell.data_type in ("f", "e") for cell in used):
                        raise ValueError(f"{name}, fila {index}: fórmula o error de Excel.")
                    if es_nota_snies(tuple(cell.value for cell in cells)):
                        notes += 1
                        continue
                    values = tuple(cell.value for cell in used)
                    if all(v is None for v in values):
                        continue
                    total += 1
                    key = tuple(normalize(values[i]) for i in keys)
                    if any(not key[j] for j in required_keys):
                        raise ValueError(f"{name}, fila {index}: falta una parte de la clave.")
                    if any(len(str(value)) > 8192 for value in values):
                        raise ValueError(f"{name}, fila {index}: valor demasiado largo.")
                    if key in seen:
                        if seen[key] != values:
                            raise ValueError(f"{name}, fila {index}: clave repetida con valores diferentes.")
                        duplicates += 1
                    else:
                        seen[key] = values
                    if len(preview) < 4:
                        preview.append([v.isoformat() if isinstance(v, date) else v for v in values])
                sheets.append({"name": name, "columns": required, "rows": total,
                               "duplicates": duplicates, "notes": notes, "preview": preview})
        finally:
            book.close()
    return {"filename": filename, "bytes": path.stat().st_size, "sheets": sheets}
