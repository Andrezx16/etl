$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/env.ps1"
. "$PSScriptRoot/dotnet.ps1"
$MercuryDotnet = Get-MercuryDotnet
$py = Join-Path $MercuryRoot '.venv/Scripts/python.exe'
if (-not (Test-Path $py)) { throw 'Ejecuta el instalador de dependencias.' }
$log = Join-Path $MercuryRoot '.mercury'
New-Item -Force -ItemType Directory $log | Out-Null
$assembly = Join-Path $MercuryRoot 'ssas-service/bin/Debug/net8.0/Mercury.Ssas.dll'
if (-not (Test-Path $assembly)) { throw 'Ejecuta scripts/setup.ps1 para compilar el servicio SSAS.' }
& "$PSScriptRoot/services.ps1" -UseConfiguration
. "$PSScriptRoot/ports.ps1"
$web = Get-MercuryFreePort -PreferredPort ([int]$env:MERCURY_WEB_PORT)
$api = Get-MercuryFreePort -PreferredPort ([int]$env:MERCURY_API_PORT) -Reserved @($web)
$bridge = [UriBuilder]::new($env:MERCURY_SSAS_URL)
$ssas = Get-MercuryFreePort -PreferredPort $bridge.Port -Reserved @($web,$api)
$bridge.Port = $ssas
$env:MERCURY_WEB_PORT = $web
$env:MERCURY_API_PORT = $api
$env:MERCURY_SSAS_URL = $bridge.Uri.GetLeftPart([UriPartial]::Authority)
Write-Host "Puertos de Mercury: web $web, API $api, puente SSAS $ssas."
$started = @()
try {
    $started += Start-Process $MercuryDotnet -ArgumentList @('exec', ('"' + $assembly + '"')) -WorkingDirectory "$MercuryRoot/ssas-service" -RedirectStandardOutput "$log/ssas.out" -RedirectStandardError "$log/ssas.err" -WindowStyle Hidden -PassThru
    $started += Start-Process $py -ArgumentList @('-m','uvicorn','api:app','--host','127.0.0.1','--port',$env:MERCURY_API_PORT) -WorkingDirectory "$MercuryRoot/backend" -RedirectStandardOutput "$log/api.out" -RedirectStandardError "$log/api.err" -WindowStyle Hidden -PassThru
    $started += Start-Process $py -ArgumentList @('-m','jobs') -WorkingDirectory "$MercuryRoot/backend" -RedirectStandardOutput "$log/worker.out" -RedirectStandardError "$log/worker.err" -WindowStyle Hidden -PassThru
    Write-Host "Mercury local: http://127.0.0.1:$env:MERCURY_WEB_PORT"
    Push-Location "$MercuryRoot/frontend"
    try {
        npm.cmd run dev
        if ($LASTEXITCODE -ne 0) { throw "Vite termino con el codigo $LASTEXITCODE." }
    } finally { Pop-Location }
} finally {
    foreach ($process in $started) { if (-not $process.HasExited) { Stop-Process -Id $process.Id } }
}
