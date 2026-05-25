# Weekly Project Home - Local Server Launcher (PowerShell)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path $scriptDir "public"

if (-not (Test-Path $publicDir)) {
  Write-Error "public directory not found at $publicDir"
  exit 2
}

# Change directory to public to serve static files correctly
Set-Location $publicDir

# Find Python executable
$python = Get-Command python -ErrorAction SilentlyContinue
$pyExecutable = $null

if ($python) {
  $pyExecutable = $python.Path
} else {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    $pyExecutable = $py.Path
  } else {
    # Probe common install locations when PATH is incomplete
    $candidates = @(
      "$env:LOCALAPPDATA\Microsoft\WindowsApps\python.exe",
      "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
      "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
      "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
      "C:\Python313\python.exe",
      "C:\Python312\python.exe",
      "C:\Python311\python.exe"
    )
    foreach ($c in $candidates) {
      if (Test-Path $c) {
        $pyExecutable = $c
        break
      }
    }
  }
}

# Premium UX: Automatically open browser
Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "      Weekly Project Home Local Server       " -ForegroundColor Magenta -NoNewline
Write-Host " [v1.0]" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  -> Serving folder: $publicDir" -ForegroundColor Gray

if ($pyExecutable) {
  Write-Host "  -> Launching browser to http://127.0.0.1:4000 ..." -ForegroundColor Green
  Write-Host "  -> Press Ctrl+C in this terminal to stop." -ForegroundColor DarkYellow
  Write-Host "=============================================" -ForegroundColor Magenta
  Write-Host ""
  
  # Asynchronous 800ms delay to let Python server bind before Chrome requests
  Start-Process powershell -ArgumentList "-Command", "Start-Sleep -m 800; Start-Process 'http://127.0.0.1:4000'" -WindowStyle Hidden
  
  & $pyExecutable -m http.server 4000 --bind 127.0.0.1
} else {
  # Fallback to Node.js (npx serve)
  $npx = Get-Command npx -ErrorAction SilentlyContinue
  if ($npx) {
    Write-Host "  -> Python not found. Falling back to Node.js (npx serve)..." -ForegroundColor Yellow
    Write-Host "  -> Launching browser to http://127.0.0.1:4000 ..." -ForegroundColor Green
    Write-Host "  -> Press Ctrl+C in this terminal to stop." -ForegroundColor DarkYellow
    Write-Host "=============================================" -ForegroundColor Magenta
    Write-Host ""
    
    # Asynchronous 800ms delay to let Node server bind before Chrome requests
    Start-Process powershell -ArgumentList "-Command", "Start-Sleep -m 800; Start-Process 'http://127.0.0.1:4000'" -WindowStyle Hidden
    
    & $npx.Path --yes serve -l 4000
    exit $LASTEXITCODE
  } else {
    Write-Error "Neither Python nor Node.js (npx) was found in PATH. Please install Python or Node.js to run the local server."
    exit 9009
  }
}
