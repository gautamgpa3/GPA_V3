# Computax Bridge

GPA can read Computax data through a read-only bridge script. The bridge is designed to run on the Windows machine or server where Computax SQL Server is installed.

## What It Does

- Reads Computax SQL Server data.
- Creates GPA-compatible client/contact records.
- Sends records to GPA preview/matching.
- Does not update, delete, or write anything in Computax.

## Default Computax Location Found

The installation at `\\server\d\CompuOffice Online` uses:

- SQL Server instance: `(local)\compuoffice`
- Database: `CompuOffice`
- Main database file: `Database\CompuOffice.mdf`

Because `(local)` means local to the Computax server, this bridge should be run from that server or from a machine that can connect to the SQL instance.

## Commands

Run from the GPA project folder on the Computax/server machine.

For non-technical use, copy these files to the Computax server and double-click:

- `computax_discover.bat`
- `computax_export.bat`

The export file will be created as `computax_clients.json` in the same folder.

Discover possible client tables:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\computax_bridge.ps1 -Mode Discover
```

Auto-export from the strongest detected table:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\computax_bridge.ps1 -Mode AutoExport -OutputPath .\computax_clients.json
```

Push to GPA preview:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\computax_bridge.ps1 -Mode Push -GpaUrl "https://gpa.cagautamacharya.com" -GpaUsername "YOUR_GPA_USERNAME" -GpaPassword "YOUR_GPA_PASSWORD"
```

If automatic detection chooses the wrong table, copy `tools\computax_client_query.example.sql`, edit the table/column names based on Discover output, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\computax_bridge.ps1 -Mode Export -QueryFile .\my_computax_client_query.sql -OutputPath .\computax_clients.json
```

Then paste the generated JSON into GPA Settings -> External client data review, preview matches, manually correct matches, and apply.
