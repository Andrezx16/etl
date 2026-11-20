"""
etl/extraccion.py   (FD-01)
Lee las fuentes SNIES (Excel o CSV) con Pandas y devuelve cada una como un
DataFrame de texto, ya con los nombres de columna de staging. Un solo punto de
lectura para todas las fuentes: no hay que ejecutar programas por separado.
"""
import warnings
from pathlib import Path

import pandas as pd

from config.fuentes import fuentes_ordenadas
from config.settings import DATA_ENTRADA
from etl.pie_snies import es_nota_snies

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")


def extraer_fuente(fuente, carpeta=DATA_ENTRADA, cache_excel=None):
    """Lee una fuente y devuelve un DataFrame con dtype texto.
    Solo conserva las columnas configuradas y las renombra a staging.
    Las celdas vacías quedan como None."""
    ruta = Path(carpeta) / fuente["archivo"]
    if ruta.suffix.lower() == ".csv":
        df = pd.read_csv(ruta, dtype=str)
    else:
        if cache_excel is None:
            cache_excel = {}
        if ruta not in cache_excel:       # el archivo se abre una sola vez
            cache_excel[ruta] = pd.ExcelFile(ruta)
        df = cache_excel[ruta].parse(fuente["hoja"], dtype=str)
        if df.shape[1] >= 2:
            candidates = df.iloc[:, 0].str.strip().str.casefold().eq("nota:").fillna(False)
            notes = df.loc[candidates].astype(object).where(lambda table: table.notna(), None)
            for index, *values in notes.itertuples(name=None):
                if es_nota_snies(values):
                    df = df.drop(index)

    df.columns = [str(c).strip() for c in df.columns]
    df = df[list(fuente["columnas"])].rename(columns=fuente["columnas"])
    return df.astype(object).where(df.notna(), None)


def extraer_todas(carpeta=DATA_ENTRADA):
    """Recorre las fuentes en orden y devuelve {nombre_fuente: DataFrame}."""
    cache, resultado = {}, {}
    for fuente in fuentes_ordenadas():
        resultado[fuente["nombre"]] = extraer_fuente(fuente, carpeta, cache)
    return resultado
