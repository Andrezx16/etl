param([switch]$Serve, [string]$ShareUrl, [string[]]$AllowedEmail, [switch]$Public)
$ErrorActionPreference = 'Stop'
if ($ShareUrl -or $AllowedEmail -or $Public) {
    if ($ShareUrl -notmatch '^https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ngrok-free\.(?:app|dev)/?$') {
        throw 'Usa la URL HTTPS que ngrok asigno a tu cuenta gratuita.'
    }
    if ($Public -and $PSBoundParameters.ContainsKey('AllowedEmail')) {
        throw 'Elige -Public o -AllowedEmail para compartir Mercury.'
    }
    if (-not $Public) {
        $AllowedEmail = @($AllowedEmail | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
        if ($AllowedEmail.Count -lt 1 -or $AllowedEmail.Count -gt 3 -or
            ($AllowedEmail | Where-Object { $_ -notmatch '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' })) {
            throw 'Usa -AllowedEmail con uno a tres correos, o usa -Public para compartir sin inicio de sesion.'
        }
    }
    $ngrok = (Get-Command ngrok.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $ngrok) {
        $portableNgrok = Join-Path (Split-Path -Parent $PSScriptRoot) '.mercury/tools/ngrok.exe'
        if (Test-Path -LiteralPath $portableNgrok -PathType Leaf) { $ngrok = $portableNgrok }
    }
    if (-not $ngrok) { throw 'Instala ngrok para Windows y configura tu token en su CLI antes de compartir Mercury.' }
    $Serve = $true
}
. "$PSScriptRoot/env.ps1"
. "$PSScriptRoot/dotnet.ps1"
$MercuryDotnet = Get-MercuryDotnet
$py = Join-Path $MercuryRoot '.venv/Scripts/python.exe'
if (-not (Test-Path $py)) { throw 'Ejecuta el instalador de dependencias.' }
$log = Join-Path $MercuryRoot '.mercury'
New-Item -Force -ItemType Directory $log | Out-Null
$assembly = Join-Path $MercuryRoot 'ssas-service/bin/Debug/net8.0/Mercury.Ssas.dll'
if (-not (Test-Path $assembly)) { throw 'Ejecuta scripts/setup.ps1 para compilar el servicio SSAS.' }
if ($Serve) {
    npm.cmd --prefix "$MercuryRoot/frontend" run build
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la interfaz de Mercury.' }
}
& "$PSScriptRoot/services.ps1" -UseConfiguration
. "$PSScriptRoot/ports.ps1"
$web = Get-MercuryFreePort -PreferredPort ([int]$env:MERCURY_WEB_PORT)
$api = if ($Serve) { $web } else { Get-MercuryFreePort -PreferredPort ([int]$env:MERCURY_API_PORT) -Reserved @($web) }
$bridge = [UriBuilder]::new($env:MERCURY_SSAS_URL)
$ssas = Get-MercuryFreePort -PreferredPort $bridge.Port -Reserved @($web,$api)
$bridge.Port = $ssas
$env:MERCURY_WEB_PORT = $web
$env:MERCURY_API_PORT = $api
$env:MERCURY_SSAS_URL = $bridge.Uri.GetLeftPart([UriPartial]::Authority)
$env:MERCURY_SHARE_ORIGIN = ''
$env:MERCURY_SHARE_KEY = ''
Write-Host "Puertos de Mercury: web $web, API $api, puente SSAS $ssas."
$started = @()
$policyFile = $null
try {
    if ($ShareUrl) {
        $env:MERCURY_SHARE_ORIGIN = $ShareUrl.TrimEnd('/').ToLowerInvariant()
        $env:MERCURY_SHARE_KEY = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
        $policy = @{ on_http_request = @() }
        if (-not $Public) {
            $emailList = ($AllowedEmail | ForEach-Object { "'$_'" }) -join ', '
            $policy.on_http_request += @(
                @{ actions = @(@{ type = 'oauth'; config = @{ provider = 'google' } }) },
                @{ expressions = @("!(actions.ngrok.oauth.identity.email in [$emailList])"); actions = @(@{ type = 'deny'; config = @{ status_code = 403 } }) }
            )
        }
        $policy.on_http_request += @{ actions = @(
            @{ type = 'remove-headers'; config = @{ headers = @('x-mercury-share') } },
            @{ type = 'add-headers'; config = @{ headers = @{ 'x-mercury-share' = $env:MERCURY_SHARE_KEY; host = ([uri]$env:MERCURY_SHARE_ORIGIN).Host } } }
        ) }
        $policyFile = Join-Path $log ('ngrok-policy-' + [Guid]::NewGuid().ToString('N') + '.json')
        [IO.File]::WriteAllText($policyFile, ($policy | ConvertTo-Json -Depth 12))
    }
    $entry = if ($Serve) { 'server:app' } else { 'api:app' }
    $started += Start-Process $MercuryDotnet -ArgumentList @('exec', ('"' + $assembly + '"')) -WorkingDirectory "$MercuryRoot/ssas-service" -RedirectStandardOutput "$log/ssas.out" -RedirectStandardError "$log/ssas.err" -WindowStyle Hidden -PassThru
    $started += Start-Process $py -ArgumentList @('-m','uvicorn',$entry,'--host','127.0.0.1','--port',$env:MERCURY_API_PORT) -WorkingDirectory "$MercuryRoot/backend" -RedirectStandardOutput "$log/api.out" -RedirectStandardError "$log/api.err" -WindowStyle Hidden -PassThru
    $started += Start-Process $py -ArgumentList @('-m','jobs') -WorkingDirectory "$MercuryRoot/backend" -RedirectStandardOutput "$log/worker.out" -RedirectStandardError "$log/worker.err" -WindowStyle Hidden -PassThru
    if ($ShareUrl) {
        $ready = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        do {
            if ($started | Where-Object HasExited) { throw 'Un servicio de Mercury termino antes de arrancar. Revisa los registros en .mercury.' }
            $socket = [Net.Sockets.TcpClient]::new()
            try { $socket.Connect('127.0.0.1', $api); $ready = $true }
            catch [Net.Sockets.SocketException] { Start-Sleep -Milliseconds 200 }
            finally { $socket.Dispose() }
        } until ($ready -or [DateTime]::UtcNow -ge $deadline)
        if (-not $ready) { throw 'La API local no inicio a tiempo. Consulta .mercury/api.err.' }
        Write-Host "Mercury compartido: $env:MERCURY_SHARE_ORIGIN/app"
        if ($Public) { Write-Host 'Modo publico: el acceso no requiere iniciar sesion.' }
        & $ngrok http "http://127.0.0.1:$api" --url $env:MERCURY_SHARE_ORIGIN --traffic-policy-file $policyFile --inspect=false
        if ($LASTEXITCODE -ne 0) { throw "ngrok termino con el codigo $LASTEXITCODE." }
    } elseif ($Serve) {
        Write-Host "Mercury local: http://127.0.0.1:$web/app"
        Wait-Process -InputObject $started[1]
        if ($started[1].ExitCode -ne 0) { throw 'La API termino con error. Consulta .mercury/api.err.' }
    } else {
        Write-Host "Mercury local: http://127.0.0.1:$web"
        Push-Location "$MercuryRoot/frontend"
        try {
            npm.cmd run dev
            if ($LASTEXITCODE -ne 0) { throw "Vite termino con el codigo $LASTEXITCODE." }
        } finally { Pop-Location }
    }
} finally {
    foreach ($process in $started) { if (-not $process.HasExited) { Stop-Process -Id $process.Id } }
    if ($policyFile) { Remove-Item -LiteralPath $policyFile -ErrorAction SilentlyContinue }
    $env:MERCURY_SHARE_KEY = ''
    $env:MERCURY_SHARE_ORIGIN = ''
}
