"""Asistente local de conexiones. Los secretos se escriben únicamente en .env."""
import getpass
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import winreg
from contextlib import closing
from pathlib import Path

import psycopg2
import pyodbc
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[1]
SQL_DRIVER = "ODBC Driver 18 for SQL Server"
DATABASE = "bodega_snies"
CUBE = "Cubo_SNIES"


def ask(label, default):
    return input(f"{label} [{default}]: ").strip() or default


def confirm(message):
    return input(f"{message} [s/N]: ").strip().lower() in {"s", "sí", "si"}


def start_local_services(**targets):
    arguments = [item for name, value in targets.items() if value for item in (f"-{name}", value)]
    result = subprocess.run(["powershell.exe", "-NoProfile", "-File", str(ROOT / "scripts/services.ps1"), *arguments])
    if result.returncode:
        raise ValueError("No se pudieron iniciar los servicios de Windows. Revisa el mensaje anterior.")


def read_registry(path, name):
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path, access=winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            return winreg.QueryValueEx(key, name)[0]
    except OSError:
        return None


def choose_instance(kind, label):
    path = fr"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\{kind}"
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path, access=winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            names = sorted(winreg.EnumValue(key, index)[0] for index in range(winreg.QueryInfoKey(key)[1]))
    except OSError:
        names = []
    if not names:
        raise ValueError(f"No se detectó {label} en Windows. Instálalo y vuelve a ejecutar el asistente.")
    host = socket.gethostname()
    instances = {name: host if name.upper() == "MSSQLSERVER" else f"{host}\\{name}" for name in names}
    if len(names) == 1:
        choice = names[0]
    else:
        for number, address in enumerate(instances.values(), 1):
            print(f"  {number}. {address}")
        selected = ask(f"Instancia de {label}", "1")
        if not selected.isdecimal() or not 1 <= int(selected) <= len(names):
            raise ValueError("Selecciona uno de los números de la lista.")
        choice = names[int(selected) - 1]
    if not re.fullmatch(r"[\w.-]+", host) or not re.fullmatch(r"\w+", choice):
        raise ValueError(f"Nombre de instancia no admitido por el asistente de {label}.")
    print(f"{label}: {instances[choice]}")
    return choice, instances[choice]


def configure_sql(server):
    if SQL_DRIVER not in pyodbc.drivers():
        raise ValueError(f"Instala {SQL_DRIVER} (64 bits) y vuelve a ejecutar el asistente.")

    def connect(trust):
        prefix = (f"Driver={{{SQL_DRIVER}}};Server={server};Trusted_Connection=yes;"
                  f"Encrypt=yes;TrustServerCertificate={'yes' if trust else 'no'};Database=")
        with closing(pyodbc.connect(prefix + "master;", timeout=5)) as connection:
            cursor = connection.cursor()
            exists, can_create = cursor.execute(
                "SELECT DB_ID(?), HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE')", DATABASE).fetchone()
            if exists is None and not can_create:
                raise ValueError(f"Tu cuenta de Windows necesita permiso para crear {DATABASE} en SQL Server.")
        return prefix + DATABASE + ";", prefix + "master;"

    trust = False
    try:
        sql_connections = connect(trust)
    except pyodbc.Error as error:
        certificate_error = re.search(r"certific|ssl provider|proveedor ssl", str(error), re.I)
        if not certificate_error or not confirm("El certificado local no se pudo validar. ¿Confiar en él solo para este SQL Server local?"):
            raise ValueError("No se pudo conectar a SQL Server. Revisa el servicio, el certificado y los permisos de tu cuenta de Windows.") from None
        trust = True
        try:
            sql_connections = connect(trust)
        except pyodbc.Error:
            raise ValueError("SQL Server no aceptó la conexión. Revisa la instancia y tu cuenta de Windows.") from None
    return *sql_connections, trust


def configure_ssas(dotnet, instance, address, sql_server, trust):
    connection = f"Data Source={address};Initial Catalog={CUBE};Integrated Security=SSPI;Connect Timeout=5"
    service = ROOT / "ssas-service/bin/Debug/net8.0/Mercury.Ssas.dll"
    try:
        probe = subprocess.run([dotnet, str(service), "--check-instance"],
                               env={**os.environ, "SSAS_CONNECTION": connection, "SSAS_DATABASE": CUBE},
                               timeout=20, capture_output=True)
    except subprocess.TimeoutExpired:
        raise ValueError("SSAS tardó en responder. Verifica que el servicio esté iniciado.") from None
    if probe.returncode == 0:
        print(f"SSAS: se reutilizará el cubo {CUBE}.")
        return connection, "", ""
    if probe.returncode == 3:
        raise ValueError("La instancia de SSAS debe estar en modo multidimensional.")
    if probe.returncode != 10:
        raise ValueError("No se pudo consultar SSAS. Comprueba que el servicio esté iniciado y que tu cuenta de Windows pueda administrarlo.")

    provider = next((name for name in ("MSOLEDBSQL19", "MSOLEDBSQL")
                     if read_registry(fr"SOFTWARE\Classes\{name}\CLSID", "")), None)
    if not provider:
        raise ValueError("Instala Microsoft OLE DB Driver for SQL Server para que el cubo pueda leer la bodega.")
    service_name = "MSSQLServerOLAPService" if instance.upper() == "MSSQLSERVER" else f"MSOLAP${instance}"
    account = read_registry(fr"SYSTEM\CurrentControlSet\Services\{service_name}", "ObjectName")
    if not account:
        raise ValueError("No se pudo detectar la cuenta del servicio de SSAS. Consulta la configuración avanzada.")
    if account == "LocalSystem":
        account = r"NT AUTHORITY\SYSTEM"
    elif account.startswith(".\\"):
        account = socket.gethostname() + account[1:]
    print(f"Al preparar la instalación, Mercury dará a {account} permiso de lectura sobre el esquema dw y desplegará {CUBE}.")
    encryption = "Mandatory" if provider == "MSOLEDBSQL19" else "true"
    source = (f"Provider={provider};Data Source={sql_server};Integrated Security=SSPI;Initial Catalog={DATABASE};"
              f"Use Encryption for Data={encryption};Trust Server Certificate={'true' if trust else 'false'}")
    return connection, source, account


def provision_postgres(connection, database, user, password):
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute("SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=%s), "
                       "EXISTS(SELECT FROM pg_database WHERE datname=%s)", (user, database))
        if any(cursor.fetchone()):
            raise ValueError("El usuario o la base ya existe. Ejecuta el asistente y elige usar una cuenta existente.")
        cursor.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD %s").format(sql.Identifier(user)), (password,))
        try:
            cursor.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(database), sql.Identifier(user)))
        except psycopg2.Error:
            cursor.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(user)))
            raise


def configure_postgres(config):
    host = ask("Servidor PostgreSQL", config.get("PGHOST") or "127.0.0.1")
    port = ask("Puerto PostgreSQL", config.get("PGPORT") or "5432")
    if not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise ValueError("El puerto de PostgreSQL debe estar entre 1 y 65535.")
    start_local_services(PgHost=host, PgService=config.get("MERCURY_PG_SERVICE"))
    database = ask("Base de Mercury", config.get("PGDATABASE") or "mercury_dw")
    create = confirm("¿Crear una cuenta dedicada y una base nueva para Mercury?")
    user = ask("Usuario de Mercury", "mercury" if create else config.get("PGUSER") or "mercury")
    options = dict(host=host, port=port, connect_timeout=5)
    if create:
        admin = ask("Usuario autorizado de PostgreSQL", "postgres")
        print(f"Se crearán el usuario {user} y la base {database} en {host}.")
        if not confirm("¿Confirmas la creación?"):
            raise ValueError("Se canceló la configuración.")
        password = secrets.token_urlsafe(32)
        with closing(psycopg2.connect(**options, dbname="postgres", user=admin,
                                     password=getpass.getpass(f"Contraseña de {admin}: "))) as connection:
            provision_postgres(connection, database, user, password)
    else:
        password = getpass.getpass(f"Contraseña de {user}: ")
    with closing(psycopg2.connect(**options, dbname=database, user=user, password=password)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT has_database_privilege(current_user, current_database(), 'CREATE')")
            if not cursor.fetchone()[0]:
                raise ValueError("La cuenta PostgreSQL necesita permiso para crear los esquemas de la base elegida.")
    return dict(PGHOST=host, PGPORT=port, PGDATABASE=database, PGUSER=user, PGPASSWORD=password)


def write_env(path, original, updates):
    if any("\n" in value or "\r" in value or "\0" in value for value in updates.values()):
        raise ValueError("La configuración contiene un carácter incompatible con .env.")
    lines = []
    for line in original.splitlines():
        key = line.partition("=")[0]
        if key in updates:
            lines.append(f"{key}={updates.pop(key)}")
        else:
            lines.append(line)
    lines.extend(f"{key}={value}" for key, value in updates.items())
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        try:
            file.write("\n".join(lines) + "\n")
        except BaseException:
            file.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main(dotnet):
    path = ROOT / ".env"
    exists = path.is_file()
    if exists and not confirm("Ya existe una configuración. ¿Actualizar sus conexiones?"):
        return
    original = (path if exists else ROOT / ".env.example").read_text(encoding="utf-8-sig")
    config = dict(line.split("=", 1) for line in original.splitlines() if re.match(r"^[A-Z_0-9]+=", line))
    print("Configuración local de Mercury")
    _, sql_server = choose_instance("SQL", "SQL Server")
    start_local_services(SqlServer=sql_server)
    sql_connection, sql_admin, trust = configure_sql(sql_server)
    instance, ssas_address = choose_instance("OLAP", "Analysis Services")
    start_local_services(SsasServer=ssas_address)
    ssas_connection, ssas_source, ssas_account = configure_ssas(dotnet, instance, ssas_address, sql_server, trust)
    if ssas_account and not confirm("¿Aplicar esa preparación del cubo cuando la confirmes desde Mercury?"):
        raise ValueError("Se canceló la configuración.")
    postgres = configure_postgres(config)
    key = config.get("MERCURY_SERVICE_KEY", "")
    write_env(path, original, {**postgres, "SQLSERVER_CONNECTION": sql_connection,
        "SQLSERVER_ADMIN_CONNECTION": sql_admin, "SSAS_CONNECTION": ssas_connection,
        "SSAS_DATABASE": CUBE, "SSAS_SOURCE_CONNECTION": ssas_source, "SSAS_SOURCE_SERVICE_ACCOUNT": ssas_account,
        "MERCURY_SERVICE_KEY": key if len(key) >= 24 else secrets.token_urlsafe(32)})
    print("Conexiones guardadas. En la web, abre Configuración y selecciona Preparar instalación.")


if __name__ == "__main__":
    if not sys.stdin.isatty():
        sys.exit("Ejecuta el asistente en una consola interactiva de PowerShell.")
    try:
        main(sys.argv[1])
    except (KeyboardInterrupt, EOFError):
        sys.exit("Configuración cancelada.")
    except psycopg2.Error:
        sys.exit("PostgreSQL no aceptó la operación. Comprueba el servicio, la contraseña y los permisos indicados.")
    except ValueError as error:
        sys.exit(str(error))
