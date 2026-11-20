import os
import re
from contextlib import closing
import pyodbc
from db.conexion import inicializar_base
from settings import ROOT
from ssas_client import call

def configured():
    return bool(os.getenv("SQLSERVER_ADMIN_CONNECTION"))


def grant_ssas_reader(cursor, account):
    cursor.execute("USE [master];")
    cursor.execute("""
        DECLARE @account nvarchar(128) = ?;
        IF SUSER_ID(@account) IS NULL
        BEGIN
            DECLARE @statement nvarchar(max) = N'CREATE LOGIN ' + QUOTENAME(@account) + N' FROM WINDOWS';
            EXEC (@statement);
        END
    """, account)
    cursor.execute("USE [bodega_snies];")
    cursor.execute("""
        DECLARE @account nvarchar(128) = ?;
        DECLARE @principal nvarchar(258) = QUOTENAME(@account);
        IF DATABASE_PRINCIPAL_ID(@account) IS NULL
            EXEC (N'CREATE USER ' + @principal + N' FOR LOGIN ' + @principal);
        EXEC (N'GRANT SELECT ON SCHEMA::[dw] TO ' + @principal);
    """, account)


def initialize(update):
    update("Preparar PostgreSQL")
    inicializar_base()
    update("Preparar SQL Server")
    admin = os.environ["SQLSERVER_ADMIN_CONNECTION"]
    with closing(pyodbc.connect(admin, autocommit=True, timeout=5)) as conn:
        conn.timeout = 90
        script = (ROOT / "warehouse" / "05_dw_sqlserver.sql").read_text(encoding="utf-8-sig")
        cursor = conn.cursor()
        for batch in re.split(r"^GO\s*$", script, flags=re.M | re.I):
            if batch.strip():
                cursor.execute(batch)
                while cursor.nextset():
                    pass
        account = os.getenv("SSAS_SOURCE_SERVICE_ACCOUNT")
        if account:
            update("Dar acceso de lectura al servicio SSAS")
            grant_ssas_reader(cursor, account)
    update("Comprobar o desplegar estructura de SSAS")
    call("POST", "cube/deploy", {})
