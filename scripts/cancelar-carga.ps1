param([string]$Corrida)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/env.ps1"
$python = Join-Path $MercuryRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Ejecuta scripts/setup.ps1 para instalar las dependencias de Mercury.'
}
if (-not $Corrida) {
    $Corrida = Read-Host 'Escribe los primeros 8 caracteres del ID de la carga en Historial'
}
$Corrida = $Corrida.Trim()
if ($Corrida -notmatch '^[0-9a-fA-F]{8}$') {
    throw 'Indica exactamente los primeros 8 caracteres del ID.'
}

Push-Location "$MercuryRoot/backend"
try {
    @'
import sys

from filelock import FileLock, Timeout
from settings import DATA
from storage import db, now

prefix = sys.argv[1].lower()
if not (DATA / "mercury.sqlite3").is_file():
    sys.exit("No se encontro la base operativa de Mercury.")

try:
    with FileLock(str(DATA / "worker.lock"), timeout=0):
        with db(write=True) as conn:
            row = conn.execute(
                "SELECT id, checkpoint FROM run "
                "WHERE substr(id,1,8)=? AND kind='load' "
                "AND state IN ('EN_COLA','EN_PROCESO')", (prefix,)
            ).fetchone()
            if row is None:
                sys.exit("No hay una carga activa con ese ID. Comprueba el Historial.")
            conn.execute(
                "UPDATE run SET state='ERROR', stage=?, error=?, ended=? WHERE id=?",
                ("Carga cancelada manualmente",
                 "La carga se cancel\u00f3. Solo se reanudar\u00e1 si pulsas Reintentar.",
                 now(), row["id"]),
            )
        print(f"Carga {prefix} cancelada en el punto de control {row['checkpoint']}.")
except Timeout:
    sys.exit("Mercury sigue ejecutandose. Pulsa Ctrl+C en su terminal y vuelve a intentar.")
'@ | & $python - $Corrida
    if ($LASTEXITCODE -ne 0) {
        throw 'La corrida no se cancelo. Revisa el mensaje anterior.'
    }
} finally {
    Pop-Location
}
