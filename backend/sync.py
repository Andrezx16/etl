from contextlib import closing, suppress
import re
from uuid import uuid4
import pyodbc
from db.conexion import conectar
from settings import SQLSERVER

TABLES = {
    "dim_institucion": ("sk_institucion", ("codigo_institucion",)),
    "dim_ubicacion": ("sk_ubicacion", ("departamento", "municipio", "tipo_cobertura")),
    "dim_area_conocimiento": ("sk_area_conocimiento", ("area_conocimiento", "nbc", "cine_f_amplio", "cine_f_especifico", "cine_f_detallado")),
    "dim_modalidad": ("sk_modalidad", ("nivel_academico", "nivel_formacion", "modalidad", "periodicidad", "periodicidad_admisiones", "ciclos_propedeuticos")),
    "dim_estado_calidad": ("sk_estado_calidad", ("estado_programa", "reconocimiento_ministerio")),
    "dim_tiempo": ("sk_tiempo", ("fecha",)),
    "dim_programa": ("sk_programa", ("codigo_snies",)),
    "hecho_oferta_programa": ("sk_programa", ("sk_programa",)),
}

class SyncError(RuntimeError):
    """SQL Server error with a stage and driver codes safe for the run history."""


def sync_error(operation, error):
    state = str(error.args[0]) if error.args else ""
    state = state if re.fullmatch(r"[A-Z0-9]{5}", state) else "desconocido"
    diagnostic = str(error.args[1]) if len(error.args) > 1 else ""
    native = list(dict.fromkeys(re.findall(r"\((-?\d{1,10})\)(?=\s*(?:\(|;|$))", diagnostic)))
    codes = f"ODBC {state}" + (", SQL " + ", ".join(native) if native else "")
    return SyncError(f"Fallo al {operation} ({codes}).")


def connect_sql(*, staging=False):
    if not SQLSERVER:
        raise RuntimeError("Configura SQLSERVER_CONNECTION.")
    try:
        # The default ODBC metadata procedure cannot describe INSERT parameters
        # for local temporary tables. Use SQL Server's alternate metadata path.
        connection_string = SQLSERVER
        if staging:
            connection_string = SQLSERVER.rstrip().rstrip(";") + ";UseFMTONLY=Yes;"
        cn = pyodbc.connect(connection_string, timeout=5)
    except pyodbc.Error as exc:
        raise sync_error("conectar con la replica de SQL Server", exc) from exc
    cn.timeout = 120
    return cn

def qualify(alias, columns):
    return ", ".join(f"{alias}.[{col}]" for col in columns)

def synchronize():
    counts = {}
    with closing(conectar()) as pg, closing(connect_sql(staging=True)) as ms:
        pg.set_session(readonly=True, isolation_level="REPEATABLE READ")
        cursor = ms.cursor()
        operation = "obtener el bloqueo de sincronizacion"
        try:
            cursor.execute("""
            SET XACT_ABORT ON;
            IF @@TRANCOUNT = 0 BEGIN TRANSACTION;
            DECLARE @result int;
            EXEC @result = sp_getapplock @Resource='Mercury.Sync', @LockMode='Exclusive',
              @LockOwner='Transaction', @LockTimeout=5000;
            IF @result < 0 THROW 50001, 'Mercury sync lock unavailable', 1;
            """)
            for table, (key, natural) in TABLES.items():
                target = f"dw.[{table}]"
                temp = "#mercury_" + uuid4().hex
                operation = f"preparar la tabla temporal de {table}"
                with pg.cursor(name="mercury_" + table) as source:
                    source.execute(f"SELECT * FROM dw.{table}")
                    first = source.fetchmany(1000)
                    cols = [d.name for d in source.description]
                    text_columns = {d.name for d in source.description if d.type_code in {25, 1042, 1043}}
                    names = ", ".join(f"[{col}]" for col in cols)
                    cursor.execute(f"SELECT TOP (0) {names} INTO {temp} FROM {target}")
                    placeholders = ", ".join("?" for _ in cols)
                    while first:
                        operation = f"copiar las filas temporales de {table}"
                        cursor.executemany(f"INSERT INTO {temp} ({names}) VALUES ({placeholders})", first)
                        first = source.fetchmany(1000)
                operation = f"indizar la tabla temporal de {table}"
                cursor.execute(f"CREATE UNIQUE CLUSTERED INDEX keyed ON {temp} ([{key}])")
                join = f"t.[{key}]=s.[{key}]"
                old, new = qualify("t", cols), qualify("s", cols)
                def comparison(alias, columns):
                    return ", ".join(f"CONVERT(varbinary(max), {alias}.[{col}])" if col in text_columns
                                     else f"{alias}.[{col}]" for col in columns)
                changed = f"EXISTS (SELECT {comparison('t', cols)} EXCEPT SELECT {comparison('s', cols)})"
                changed_key = f"EXISTS (SELECT {comparison('t', natural)} EXCEPT SELECT {comparison('s', natural)})"
                operation = f"comparar las claves de {table}"
                cursor.execute(f"""SELECT COUNT_BIG(*) FROM {target} t LEFT JOIN {temp} s ON {join}
                    WHERE s.[{key}] IS NULL OR {changed_key}""")
                if cursor.fetchone()[0]:
                    raise RuntimeError(f"Las claves de {table} difieren entre origen y réplica.")
                assignments = ", ".join(f"[{col}]=s.[{col}]" for col in cols if col != key)
                operation = f"actualizar la replica de {table}"
                cursor.execute(f"UPDATE t SET {assignments} FROM {target} t JOIN {temp} s ON {join} WHERE {changed}")
                updated = cursor.rowcount
                operation = f"insertar los registros de {table}"
                cursor.execute(f"""INSERT INTO {target} ({names}) SELECT {new} FROM {temp} s
                    WHERE NOT EXISTS (SELECT 1 FROM {target} t WHERE {join})""")
                inserted = cursor.rowcount
                operation = f"verificar la replica de {table}"
                cursor.execute(f"""SELECT COUNT_BIG(*) FROM {temp} s LEFT JOIN {target} t ON {join}
                    WHERE t.[{key}] IS NULL OR {changed}""")
                if cursor.fetchone()[0]:
                    raise RuntimeError(f"Falló la comparación de datos para {table}.")
                cursor.execute(f"SELECT COUNT_BIG(*) FROM {temp}")
                count = cursor.fetchone()[0]
                counts[table] = {"inserted": inserted, "updated": updated, "unchanged": count - inserted - updated}
                cursor.execute(f"DROP TABLE {temp}")
            operation = f"confirmar la transaccion de SQL Server"
            ms.commit()
        except BaseException as exc:
            with suppress(pyodbc.Error):
                ms.rollback()
            if isinstance(exc, pyodbc.Error):
                raise sync_error(operation, exc) from exc
            raise
    return counts
