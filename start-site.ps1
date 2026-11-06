<#
.SYNOPSIS
  Локальный запуск сайта Kampela.

.DESCRIPTION
  Режимы:
    auto   (по умолчанию) — если установлен Node.js, запускает dev-сервер Vite
                            (с автообновлением при правке файлов); иначе — static.
    dev    — dev-сервер Vite (нужен Node.js). При первом запуске сам выполнит npm install.
    static — отдаёт готовую сборку из папки dist встроенным сервером PowerShell.
             Node.js не нужен, если папка dist уже есть.
    build  — пересобирает dist (нужен Node.js) и запускает static.

.EXAMPLE
  .\start-site.ps1
  .\start-site.ps1 -Mode static -Port 8080
  .\start-site.ps1 -Mode build
#>
[CmdletBinding()]
param(
    [ValidateSet('auto', 'dev', 'static', 'build')]
    [string]$Mode = 'auto',
    [int]$Port = 5173,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
Set-Location -LiteralPath $PSScriptRoot

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Bad([string]$Text)  { Write-Host "ОШИБКА: $Text" -ForegroundColor Red }

function Test-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm  = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if ($node -and $npm) { return $npm.Source }
    return $null
}

function Invoke-Npm([string]$Npm, [string[]]$NpmArgs) {
    & $Npm @NpmArgs
    if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') завершился с кодом $LASTEXITCODE" }
}

function Install-Dependencies([string]$Npm) {
    $lock      = Join-Path $PSScriptRoot 'package-lock.json'
    $installed = Join-Path (Join-Path $PSScriptRoot 'node_modules') '.package-lock.json'
    $missing   = -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\vite'))
    $outdated  = (Test-Path -LiteralPath $lock) -and (Test-Path -LiteralPath $installed) -and
                 ((Get-Item -LiteralPath $lock -Force).LastWriteTime -gt (Get-Item -LiteralPath $installed -Force).LastWriteTime)
    if ($missing -or $outdated) {
        Write-Step 'Устанавливаю зависимости (npm install)...'
        Invoke-Npm $Npm @('install', '--no-fund', '--no-audit')
    }
}

function Find-FreePort([int]$StartPort) {
    for ($p = $StartPort; $p -lt $StartPort + 20; $p++) {
        $tcp = $null
        try {
            $tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
            $tcp.Start()
            return $p
        } catch {
            continue
        } finally {
            if ($tcp) { $tcp.Stop() }
        }
    }
    throw "Не нашёл свободный порт в диапазоне $StartPort-$($StartPort + 19)."
}

$MimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.mp4'  = 'video/mp4'
}

function Send-Response($Response, [int]$Status, [byte[]]$Body, [string]$ContentType) {
    $Response.StatusCode = $Status
    $Response.ContentType = $ContentType
    $Response.Headers['Cache-Control'] = 'no-cache'
    $Response.Headers['X-Robots-Tag'] = 'noindex, nofollow'
    $Response.ContentLength64 = $Body.Length
    if ($Body.Length -gt 0) { $Response.OutputStream.Write($Body, 0, $Body.Length) }
    $Response.OutputStream.Close()
}

function Start-StaticServer([string]$Root, [int]$WantedPort, [bool]$OpenBrowser) {
    $Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'index.html'))) {
        throw "В папке $Root нет index.html. Соберите сайт: .\start-site.ps1 -Mode build"
    }
    $p = Find-FreePort $WantedPort
    $url = "http://localhost:$p/"
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add($url)
    $listener.Start()

    Write-Host ''
    Write-Host "  Сайт Kampela открыт по адресу: $url" -ForegroundColor Green
    Write-Host "  Папка: $Root"
    Write-Host '  Остановить сервер: Ctrl+C' -ForegroundColor DarkGray
    Write-Host ''
    if ($OpenBrowser) { Start-Process $url }

    try {
        while ($listener.IsListening) {
            $async = $listener.BeginGetContext($null, $null)
            # короткое ожидание, чтобы Ctrl+C срабатывал сразу
            while (-not $async.AsyncWaitHandle.WaitOne(300)) { }
            $ctx = $listener.EndGetContext($async)
            $req = $ctx.Request
            $res = $ctx.Response
            try {
                if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
                    Send-Response $res 405 ([byte[]]@()) 'text/plain'
                    continue
                }
                $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
                if ($rel -eq '') { $rel = 'index.html' }
                $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
                if (Test-Path -LiteralPath $full -PathType Container) { $full = Join-Path $full 'index.html' }

                $inside = $full.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
                if (-not $inside -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                    Send-Response $res 404 ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found')) 'text/plain; charset=utf-8'
                    Write-Host ("404 {0}" -f $req.Url.AbsolutePath) -ForegroundColor DarkYellow
                    continue
                }
                $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
                $type = $MimeTypes[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($full)
                if ($req.HttpMethod -eq 'HEAD') {
                    $res.ContentLength64 = $bytes.Length
                    Send-Response $res 200 ([byte[]]@()) $type
                } else {
                    Send-Response $res 200 $bytes $type
                }
            } catch {
                try { Send-Response $res 500 ([System.Text.Encoding]::UTF8.GetBytes('500')) 'text/plain' } catch { }
                Write-Host "500 $($req.Url.AbsolutePath): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } finally {
        $listener.Stop()
        $listener.Close()
        Write-Host 'Сервер остановлен.'
    }
}

# ------------------------------------------------------------------ main
try {
    $npm = Test-Node
    $dist = Join-Path $PSScriptRoot 'dist'

    if ($Mode -eq 'auto') {
        if ($npm) { $Mode = 'dev' } else { $Mode = 'static' }
    }

    switch ($Mode) {
        'dev' {
            if (-not $npm) { throw 'Для режима dev нужен Node.js (https://nodejs.org, версия LTS). Без него используйте: .\start-site.ps1 -Mode static' }
            Install-Dependencies $npm
            $p = Find-FreePort $Port
            Write-Step "Запускаю dev-сервер Vite на http://localhost:$p/ (остановить: Ctrl+C)"
            $viteArgs = @('run', 'dev', '--', '--port', "$p", '--strictPort')
            if (-not $NoBrowser) { $viteArgs += '--open' }
            Invoke-Npm $npm $viteArgs
        }
        'build' {
            if (-not $npm) { throw 'Для сборки нужен Node.js (https://nodejs.org, версия LTS).' }
            Install-Dependencies $npm
            Write-Step 'Собираю сайт в папку dist...'
            Invoke-Npm $npm @('run', 'build')
            Start-StaticServer $dist $Port (-not $NoBrowser)
        }
        'static' {
            if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) {
                if (-not $npm) { throw 'Папки dist нет, а Node.js не установлен. Установите Node.js и выполните: .\start-site.ps1 -Mode build' }
                Install-Dependencies $npm
                Write-Step 'Папки dist нет — собираю сайт...'
                Invoke-Npm $npm @('run', 'build')
            }
            if (-not $npm) { Write-Step 'Node.js не найден — запускаю готовую сборку из dist встроенным сервером PowerShell.' }
            Start-StaticServer $dist $Port (-not $NoBrowser)
        }
    }
} catch {
    Write-Bad $_.Exception.Message
    exit 1
}
