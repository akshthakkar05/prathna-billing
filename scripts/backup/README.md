# Database Backup & Recovery Guide

This directory contains production database backup and verification scripts for the billing system.

## Files

1. **`db_backup.ps1`**:
   - Takes a full database dump using `pg_dump -F c` (PostgreSQL custom compressed archive).
   - Generates timestamped dump files in `backups/` directory (e.g. `prathna_billing_backup_20260912_223000.dump`).
   - Automatically prunes backup files older than 30 days.

2. **`db_restore_test.ps1`**:
   - Automated restore drill: restores the latest backup dump into a temporary database (`prathna_billing_restore_test`).
   - Asserts table counts and integrity without affecting the production database.
   - Cleans up the test database once verification completes.

## How to Run

### Manual Backup
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\db_backup.ps1
```

### Test Backup Restore Integrity
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\db_restore_test.ps1
```

### Windows Task Scheduler (Daily Automated Offsite Backup)
To set up daily automated backup at 2:00 AM:
1. Open **Task Scheduler** in Windows (`taskschd.msc`).
2. Click **Create Basic Task** -> Name: `BillingDB_DailyBackup`.
3. Trigger: **Daily** at `02:00`.
4. Action: **Start a program**.
   - Program/script: `powershell.exe`
   - Add arguments (using the recommended **Cloud-Synced Folder** default):
     ```text
     -ExecutionPolicy Bypass -File "C:\Users\Aksh\Documents\Client\prathna-billing\scripts\backup\db_backup.ps1" -SecondaryBackupDir "$env:USERPROFILE\OneDrive\BillingBackups"
     ```
   *(Replace with Google Drive, a USB drive letter e.g. `D:\BillingBackups`, or network share if preferred)*

## Off-Machine / Offsite Replication (Recommended)

Storing backups strictly on the local machine carries total data loss risk if the SSD fails or the machine is damaged/infected.

`db_backup.ps1` natively supports dual-destination replication via the `BACKUP_OFFSITE_DIR` environment variable or `-SecondaryBackupDir` argument:

### Option A: Cloud Synced Folder (Zero Maintenance)
If Microsoft OneDrive, Google Drive, or Dropbox is installed on the computer:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\db_backup.ps1 -SecondaryBackupDir "$env:USERPROFILE\OneDrive\BillingBackups"
```
Every backup is automatically synced offsite to the cloud.

### Option B: External USB Drive or Secondary Disk
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\db_backup.ps1 -SecondaryBackupDir "D:\BillingBackups"
```

### Option C: LAN Network Share / NAS
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\db_backup.ps1 -SecondaryBackupDir "\\STORE-BACKUP-PC\Backups"
```
