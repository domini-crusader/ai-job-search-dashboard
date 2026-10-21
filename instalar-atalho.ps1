# Cria o atalho "Painel de Vagas" na area de trabalho, com o icone do Pip.
#   powershell -ExecutionPolicy Bypass -File instalar-atalho.ps1 [-Root C:\caminho\ai-job-search]
# O icone e gerado a partir do GIF do proprio workspace (assets/mascot), que e do
# ai-job-search (MIT); o addon nao traz uma copia.
param([string]$Root = (Join-Path (Split-Path $PSScriptRoot -Parent) 'ai-job-search'))

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'Painel de Vagas.cmd'
if (-not (Test-Path $launcher)) { throw "Nao encontrei $launcher" }

# Icone: primeiro quadro do GIF do Pip, em 256x256.
$iconDir = Join-Path $env:LOCALAPPDATA 'ai-job-search-dashboard'
New-Item -ItemType Directory -Force $iconDir | Out-Null
$icon = Join-Path $iconDir 'pip.ico'
$gif = Join-Path $Root 'assets\mascot\pip_flight_loop.gif'
if (Test-Path $gif) {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($gif)
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.DrawImage($img, 0, 0, 256, 256)
  $ico = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $fs = [System.IO.File]::Create($icon)
  $ico.Save($fs)
  $fs.Close(); $g.Dispose(); $img.Dispose()
} else {
  Write-Host "Mascote nao encontrado em $gif; o atalho usara o icone padrao."
  $icon = $null
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Painel de Vagas.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $launcher
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.WindowStyle = 7  # minimizada: o servidor roda na janela; feche-a para encerrar
$lnk.Description = 'Abre o painel de vagas do ai-job-search'
if ($icon) { $lnk.IconLocation = "$icon,0" }
$lnk.Save()
Write-Host "Atalho criado: $lnkPath"
