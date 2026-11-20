param(
    [switch]$UseConfiguration,
    [string]$SqlServer,
    [string]$SsasServer,
    [string]$PgHost,
    [string]$PgService
)
$ErrorActionPreference = 'Stop'

function Get-MercuryLocalInstance([string]$Address) {
    if ($Address -notmatch '^(?:(?:tcp|lpc|np):)?(?<host>[^\\,]+)(?:\\(?<instance>[A-Za-z0-9_]+))?(?:,[0-9]+)?$') { return }
    if ($Matches.host -notin @('.', '(local)', 'localhost', '127.0.0.1', '::1', $env:COMPUTERNAME)) { return }
    if ($Matches.instance) { return $Matches.instance }
    if ($Address.Contains(',')) { return }
    return 'MSSQLSERVER'
}

function Start-MercuryDatabaseService([System.ServiceProcess.ServiceController]$Service) {
    if ($Service.Status -eq 'Running') { return }
    if ($Service.StartType -eq 'Disabled') {
        throw "El servicio $($Service.Name) esta deshabilitado en Windows. Habilitalo para poder iniciar Mercury."
    }
    if ($Service.Status -eq 'StopPending') {
        $Service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
    }
    if ($Service.Status -ne 'StartPending') {
        Write-Host "Iniciando $($Service.DisplayName)..."
        try {
            Start-Service -InputObject $Service -ErrorAction Stop
        } catch {
            $Service.Refresh()
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
            $principal = [Security.Principal.WindowsPrincipal]::new($identity)
            if ($Service.Status -eq 'Stopped' -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
                if ($Service.Name -notmatch '^[A-Za-z0-9_$.-]+$') { throw 'Nombre de servicio no admitido para el inicio automatico.' }
                Write-Host "Windows puede pedir autorizacion para iniciar $($Service.Name)."
                try {
                    $start = Start-Process -FilePath "$env:SystemRoot\System32\sc.exe" -ArgumentList @('start', ('"' + $Service.Name + '"')) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
                } catch {
                    throw "No se pudo autorizar el inicio de $($Service.Name). Vuelve a iniciar Mercury y acepta la solicitud de Windows."
                }
                $Service.Refresh()
                if ($start.ExitCode -ne 0 -and $Service.Status -notin @('Running', 'StartPending')) {
                    throw "Windows no pudo iniciar $($Service.Name) (codigo $($start.ExitCode)). Revisa el servicio en Windows."
                }
            } elseif ($Service.Status -notin @('Running', 'StartPending')) {
                throw "No se pudo iniciar $($Service.Name). Revisa el servicio en Windows."
            }
        }
    }
    try {
        $Service.WaitForStatus('Running', [TimeSpan]::FromSeconds(45))
    } catch {
        throw "El servicio $($Service.Name) no quedo en ejecucion a tiempo. Revisa su estado en Windows."
    }
}

if ($UseConfiguration) {
    if ($env:SQLSERVER_CONNECTION) {
        $sql = [System.Data.Odbc.OdbcConnectionStringBuilder]::new($env:SQLSERVER_CONNECTION)
        foreach ($key in @('Server', 'Data Source', 'Address', 'Addr', 'Network Address')) {
            if ($sql.ContainsKey($key)) { $SqlServer = [string]$sql[$key]; break }
        }
    }
    if ($env:SSAS_CONNECTION) {
        $ssas = [System.Data.Common.DbConnectionStringBuilder]::new()
        $ssas.set_ConnectionString($env:SSAS_CONNECTION)
        foreach ($key in @('Data Source', 'Server', 'Address', 'Addr', 'Network Address')) {
            if ($ssas.ContainsKey($key)) { $SsasServer = [string]$ssas[$key]; break }
        }
    }
    $PgHost = $env:PGHOST
    $PgService = $env:MERCURY_PG_SERVICE
}

$sqlInstance = Get-MercuryLocalInstance $SqlServer
$ssasInstance = Get-MercuryLocalInstance $SsasServer
$names = @()
if ($sqlInstance) {
    $names += $(if ($sqlInstance -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { 'MSSQL$' + $sqlInstance })
}
if ($ssasInstance) {
    $names += $(if ($ssasInstance -eq 'MSSQLSERVER') { 'MSSQLServerOLAPService' } else { 'MSOLAP$' + $ssasInstance })
}
if ($PgHost -and (Get-MercuryLocalInstance $PgHost)) {
    if ($PgService -and $PgService -notmatch '^[A-Za-z0-9_.-]+$') { throw 'MERCURY_PG_SERVICE debe contener el nombre exacto del servicio de PostgreSQL.' }
    $pg = @(Get-Service -Name $(if ($PgService) { $PgService } else { 'postgresql*' }) -ErrorAction SilentlyContinue)
    if ($pg.Count -eq 1) { $names += $pg[0].Name }
    elseif ($pg.Count -gt 1 -and -not ($pg | Where-Object Status -eq 'Running')) {
        Write-Warning 'Hay varios servicios de PostgreSQL. Indica el que usa Mercury en MERCURY_PG_SERVICE.'
    } elseif ($PgService -and $pg.Count -eq 0) {
        throw "No se encontro el servicio de PostgreSQL $PgService."
    }
}
foreach ($name in ($names | Select-Object -Unique)) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($service) { Start-MercuryDatabaseService $service }
    else { Write-Warning "No se encontro el servicio local $name. Comprueba que la instancia este instalada." }
}
