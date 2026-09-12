<#
.SYNOPSIS
  Automated PostgreSQL Backup Script for Billing System
.DESCRIPTION
  Dumps the database using pg_dump into a timestamped compressed file.
  Rotates backups older than retention days (default: 30 days).
#>

param(
    [string]$DbName = "prathna_billing",
    [string]$DbUser = "postgres",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$BackupDir = "$PSScriptRoot\..\..\backups",
    [string]$SecondaryBackupDir = $env:BACKUP_OFFSITE_DIR,
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFileName = "${DbName}_backup_${Timestamp}.dump"
$BackupFilePath = Join-Path $BackupDir $BackupFileName

Write-Host "=========================================="
Write-Host " Starting PostgreSQL Database Backup"
Write-Host " Database: $DbName"
Write-Host " Destination: $BackupFilePath"
Write-Host "=========================================="

# Check if pg_dump is available
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "pg_dump is not found in PATH. Please install PostgreSQL or add bin directory to PATH."
}

# Run pg_dump in custom format (-Fc)
& pg_dump -h $DbHost -p $DbPort -U $DbUser -F c -b -v -f $BackupFilePath $DbName

if ($LASTEXITCODE -eq 0 -and (Test-Path $BackupFilePath)) {
    $FileSize = (Get-Item $BackupFilePath).Length / 1MB
    Write-Host ("Backup completed successfully! Size: {0:N2} MB" -f $FileSize) -ForegroundColor Green
} else {
    Write-Error "pg_dump failed with exit code $LASTEXITCODE"
}

# Secondary / Off-machine Replication
if ($SecondaryBackupDir -and $SecondaryBackupDir.Trim()) {
    Write-Host "Replicating backup to offsite/secondary location: $SecondaryBackupDir..."
    try {
        if (-not (Test-Path $SecondaryBackupDir)) {
            New-Item -ItemType Directory -Path $SecondaryBackupDir -Force | Out-Null
        }
        $SecondaryTarget = Join-Path $SecondaryBackupDir $BackupFileName
        Copy-Item -Path $BackupFilePath -Destination $SecondaryTarget -Force
        Write-Host "Successfully replicated to secondary location: $SecondaryTarget" -ForegroundColor Green

        # Rotate secondary location
        $SecCutoff = (Get-Date).AddDays(-$RetentionDays)
        Get-ChildItem -Path $SecondaryBackupDir -Filter "*.dump" | Where-Object { $_.LastWriteTime -lt $SecCutoff } | ForEach-Object {
            Write-Host "Removing old secondary backup: $($_.Name)"
            Remove-Item $_.FullName -Force
        }
    } catch {
        Write-Warning "Failed to replicate to secondary location: $_. Primary backup remains intact."
    }
} else {
    Write-Host "Notice: No offsite/secondary backup directory configured." -ForegroundColor Yellow
    Write-Host "        To replicate backups off this machine, set BACKUP_OFFSITE_DIR in environment"
    Write-Host "        or pass -SecondaryBackupDir (e.g. OneDrive folder, USB drive, or network share)."
}

Write-Host "Backup process finished." -ForegroundColor Cyan
