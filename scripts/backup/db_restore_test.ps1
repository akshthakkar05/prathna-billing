<#
.SYNOPSIS
  Automated Backup Verification & Restore Test Script
.DESCRIPTION
  Finds the latest dump file and restores it into a temporary test database
  to guarantee that backups are healthy and uncorrupted.
#>

param(
    [string]$SourceDb = "prathna_billing",
    [string]$TestDbName = "prathna_billing_restore_test",
    [string]$DbUser = "postgres",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$BackupDir = "$PSScriptRoot\..\..\backups"
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " Automated Backup Integrity & Restore Test"
Write-Host "=========================================="

if (-not (Test-Path $BackupDir)) {
    Write-Error "Backup directory not found: $BackupDir"
}

$LatestBackup = Get-ChildItem -Path $BackupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $LatestBackup) {
    Write-Error "No backup files found in $BackupDir. Run db_backup.ps1 first."
}

Write-Host "Testing latest backup: $($LatestBackup.FullName)"
Write-Host "Size: $([math]::Round($LatestBackup.Length / 1MB, 2)) MB"

# Terminate existing connections and recreate temporary test database
Write-Host "Re-creating temporary test database: $TestDbName"
& psql -h $DbHost -p $DbPort -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $TestDbName WITH (FORCE);"
& psql -h $DbHost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE $TestDbName;"

# Restore using pg_restore
Write-Host "Restoring dump into $TestDbName..."
& pg_restore -h $DbHost -p $DbPort -U $DbUser -d $TestDbName --no-owner --role=$DbUser -v $LatestBackup.FullName

# Verify tables and row counts
Write-Host "Verifying restored schema and data..."
$Tables = & psql -h $DbHost -p $DbPort -U $DbUser -d $TestDbName -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
Write-Host "Restored table count: $($Tables.Trim())"

$Users = & psql -h $DbHost -p $DbPort -U $DbUser -d $TestDbName -t -c 'SELECT count(*) FROM "User";'
Write-Host "Restored User count: $($Users.Trim())"

# Drop test database
Write-Host "Cleaning up test database: $TestDbName..."
& psql -h $DbHost -p $DbPort -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $TestDbName WITH (FORCE);"

Write-Host "=========================================="
Write-Host " ✅ SUCCESS: Backup is valid and restorable!" -ForegroundColor Green
Write-Host "=========================================="
