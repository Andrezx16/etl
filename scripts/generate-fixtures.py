"""Crea dos libros sintéticos con el contrato de las fuentes de prueba."""
import argparse
from datetime import date
from pathlib import Path
from openpyxl import Workbook
from config.fuentes import FUENTES

INSTITUTION = "9998"
PROGRAM = "999900"
VALUES = {
    "Instituciones": {
        "codigo_institucion": INSTITUTION, "codigo_ies_padre": INSTITUTION,
        "nombre": "INSTITUCIÓN FICTICIA DE PRUEBAS", "sector": "OFICIAL",
        "estado": "ACTIVA", "principal_seccional": "PRINCIPAL",
        "caracter_academico": "UNIVERSIDAD", "acreditacion": "NO",
    },
    "Directivos": {
        "codigo_institucion": INSTITUTION, "nombre": "DIRECTIVO", "apellido": "FICTICIO",
        "cargo": "RECTOR", "fecha_desde": date(2023, 1, 1),
    },
    "Programas": {
        "codigo_snies": PROGRAM, "codigo_institucion": INSTITUTION,
        "nombre_programa": "PROGRAMA FICTICIO DE PRUEBAS",
        "titulo_otorgado": "TÍTULO FICTICIO", "departamento_oferta": "NARIÑO",
        "municipio_oferta": "PASTO", "nivel_academico": "PREGRADO",
        "nivel_formacion": "UNIVERSITARIA", "modalidad": "PRESENCIAL",
        "periodicidad": "SEMESTRAL", "periodicidad_admisiones": "SEMESTRAL",
        "estado_programa": "ACTIVO", "reconocimiento_ministerio": "REGISTRO CALIFICADO",
        "fecha_registro_snies": date(2020, 1, 1), "fecha_resolucion": date(2020, 1, 1),
        "creditos": 120, "duracion_periodos": 8, "costo_matricula": 1400000,
    },
    "Cobertura": {"codigo_snies": PROGRAM, "departamento": "NARIÑO",
                  "municipio": "PASTO", "tipo_cobertura": "PRINCIPAL"},
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    books = {}
    for spec in FUENTES:
        filename = spec["archivo"]
        if filename not in books:
            book = Workbook()
            book.remove(book.active)
            books[filename] = book
        sheet = books[filename].create_sheet(spec["hoja"])
        sheet.append(list(spec["columnas"]))
        sheet.append([VALUES[spec["nombre"]].get(v) for v in spec["columnas"].values()])
    for filename, book in books.items():
        target = args.directory / filename
        if target.exists():
            raise FileExistsError(target)
        book.save(target)

if __name__ == "__main__":
    main()
