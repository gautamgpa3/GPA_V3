param(
    [ValidateSet("Discover", "AutoExport", "Export", "Push")]
    [string]$Mode = "Discover",
    [string]$ServerInstance = "(local)\compuoffice",
    [string]$Database = "CompuOffice",
    [string]$QueryFile = "",
    [string]$OutputPath = ".\computax_clients.json",
    [int]$Limit = 15000,
    [string]$GpaUrl = "",
    [string]$GpaUsername = "",
    [string]$GpaPassword = ""
)

$ErrorActionPreference = "Stop"

function New-Connection {
    $connectionString = "Data Source=$ServerInstance;Initial Catalog=$Database;Integrated Security=SSPI;Connect Timeout=15"
    $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
    $connection.Open()
    return $connection
}

function Invoke-Table {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Sql
    )
    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 120
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
    $table = New-Object System.Data.DataTable
    [void]$adapter.Fill($table)
    Write-Output -NoEnumerate $table
}

function Convert-DataTableRows {
    param([System.Data.DataTable]$Table)
    $rows = @()
    foreach ($row in $Table.Rows) {
        $item = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $value = $row[$column.ColumnName]
            if ($value -is [DBNull]) {
                $value = $null
            }
            $item[$column.ColumnName] = $value
        }
        $rows += [pscustomobject]$item
    }
    return $rows
}

function Normalize-Key {
    param([string]$Value)
    if (-not $Value) {
        return ""
    }
    return ($Value.ToLowerInvariant() -replace "[^a-z0-9]", "")
}

function Find-Value {
    param(
        [object]$Row,
        [string[]]$Patterns
    )
    $properties = $Row.PSObject.Properties
    foreach ($pattern in $Patterns) {
        foreach ($property in $properties) {
            $key = Normalize-Key $property.Name
            if ($key -match $pattern) {
                $value = $property.Value
                if ($null -ne $value -and "$value".Trim() -ne "") {
                    return "$value".Trim()
                }
            }
        }
    }
    return ""
}

function Convert-ToIsoDate {
    param([object]$Value)
    if ($null -eq $Value -or "$Value".Trim() -eq "") {
        return $null
    }
    try {
        return ([datetime]$Value).ToString("yyyy-MM-dd")
    } catch {
        return $null
    }
}

function Convert-ToBridgeRecord {
    param(
        [object]$Row,
        [string]$SourceName
    )
    $name = Find-Value $Row @("^(client|assessee|party|customer)?name$", "fullname", "displayname", "tradename", "legalname")
    $pan = Find-Value $Row @("pan")
    $gst = Find-Value $Row @("gstin", "gstno", "gstnumber")
    $mobile = Find-Value $Row @("mobile", "mobileno", "cell", "phone", "phoneno", "contactno", "tel")
    $whatsapp = Find-Value $Row @("whatsapp")
    $email = Find-Value $Row @("email", "mail")
    $address = Find-Value $Row @("address", "addr")
    $constitution = Find-Value $Row @("constitution", "status", "clienttype", "assesseetype", "category")
    $company = Find-Value $Row @("company", "firm", "business")
    $code = Find-Value $Row @("^(client|assessee|party)?(id|code|no)$", "code$")
    $birthDate = Find-Value $Row @("dob", "birth", "dateofbirth", "incorporation", "doi")

    if (-not $name -and $company) {
        $name = $company
    }
    if (-not $code) {
        $code = if ($pan) { $pan } elseif ($gst) { $gst } elseif ($name) { $name } else { [guid]::NewGuid().ToString() }
    }

    return [ordered]@{
        source_id = $code
        source_name = $SourceName
        name = $name
        constitution = $constitution
        pan_no = $pan
        gst_no = $gst
        phone = $mobile
        whatsapp = if ($whatsapp) { $whatsapp } else { $mobile }
        email = $email
        address = $address
        company = $company
        work_scope = ""
        birth_date = Convert-ToIsoDate $birthDate
        notes = ""
    }
}

function Normalize-DedupeText {
    param([string]$Value)
    if (-not $Value) {
        return ""
    }
    return (($Value.Trim().ToLowerInvariant()) -replace "[^a-z0-9]", "")
}

function Get-BridgeRecordDedupeKey {
    param([object]$Record)
    if ($Record.gst_no) {
        return "gst:$($Record.gst_no.Trim().ToUpperInvariant())"
    }
    if ($Record.pan_no) {
        return "pan-name:$($Record.pan_no.Trim().ToUpperInvariant()):$(Normalize-DedupeText $Record.name)"
    }
    return "name:$(Normalize-DedupeText $Record.name):$(Normalize-DedupeText $Record.constitution)"
}

function Get-BridgeRecordCompletenessScore {
    param([object]$Record)
    $score = 0
    foreach ($field in @("name", "constitution", "pan_no", "gst_no", "phone", "whatsapp", "email", "address", "company", "work_scope", "birth_date", "notes")) {
        if ($Record.$field) {
            $score += 1
        }
    }
    return $score
}

function Merge-BridgeRecords {
    param(
        [object]$Primary,
        [object]$Secondary
    )
    foreach ($field in @("name", "constitution", "pan_no", "gst_no", "phone", "whatsapp", "email", "address", "company", "work_scope", "birth_date", "notes")) {
        if (-not $Primary.$field -and $Secondary.$field) {
            $Primary.$field = $Secondary.$field
        }
    }
    return $Primary
}

function Remove-DuplicateBridgeRecords {
    param([object[]]$Records)
    $unique = [ordered]@{}
    $duplicates = 0
    foreach ($record in $Records) {
        $key = Get-BridgeRecordDedupeKey $record
        if (-not $unique.Contains($key)) {
            $unique[$key] = $record
            continue
        }

        $duplicates += 1
        $existing = $unique[$key]
        if ((Get-BridgeRecordCompletenessScore $record) -gt (Get-BridgeRecordCompletenessScore $existing)) {
            $unique[$key] = Merge-BridgeRecords $record $existing
        } else {
            $unique[$key] = Merge-BridgeRecords $existing $record
        }
    }
    return [pscustomobject]@{
        records = @($unique.Values)
        duplicates_removed = $duplicates
    }
}

function Get-CandidateTables {
    param([System.Data.SqlClient.SqlConnection]$Connection)
    $sql = @"
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE
    LOWER(COLUMN_NAME) LIKE '%client%'
    OR LOWER(COLUMN_NAME) LIKE '%assessee%'
    OR LOWER(COLUMN_NAME) LIKE '%party%'
    OR LOWER(COLUMN_NAME) LIKE '%name%'
    OR LOWER(COLUMN_NAME) LIKE '%pan%'
    OR LOWER(COLUMN_NAME) LIKE '%gst%'
    OR LOWER(COLUMN_NAME) LIKE '%mobile%'
    OR LOWER(COLUMN_NAME) LIKE '%phone%'
    OR LOWER(COLUMN_NAME) LIKE '%email%'
    OR LOWER(COLUMN_NAME) LIKE '%birth%'
    OR LOWER(COLUMN_NAME) LIKE '%address%'
ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
"@
    $rows = Convert-DataTableRows (Invoke-Table $Connection $sql)
    $groups = $rows | Group-Object TABLE_SCHEMA, TABLE_NAME
    $candidates = @()
    foreach ($group in $groups) {
        $parts = $group.Name -split ", "
        $columns = @($group.Group | ForEach-Object { $_.COLUMN_NAME })
        $normalized = ($columns | ForEach-Object { Normalize-Key $_ }) -join " "
        $score = 0
        foreach ($word in @("name", "client", "assessee", "pan", "gst", "mobile", "phone", "email", "address", "birth")) {
            if ($normalized -match $word) {
                $score += 1
            }
        }
        $candidates += [pscustomobject]@{
            schema = $parts[0]
            table = $parts[1]
            score = $score
            columns = ($columns -join ", ")
        }
    }
    return $candidates | Sort-Object -Property @{Expression = "score"; Descending = $true}, schema, table
}

function Test-TableExists {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Schema,
        [string]$Table
    )
    $sql = "SELECT COUNT(*) AS found FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$Schema' AND TABLE_NAME = '$Table'"
    $result = Invoke-Table $Connection $sql
    return [int]$result.Rows[0].found -gt 0
}

function Get-ComputaxClientMasterSql {
    param([int]$TopLimit)
    return @"
SELECT TOP $TopLimit
    CAST(n.codeno AS varchar(80)) AS source_id,
    NULLIF(LTRIM(RTRIM(COALESCE(NULLIF(n.name, ''), NULLIF(n.businessnm, ''), NULLIF(LTRIM(RTRIM(COALESCE(n.frname, '') + ' ' + COALESCE(n.mdname, '') + ' ' + COALESCE(n.ltname, ''))), '')))), '') AS name,
    NULLIF(LTRIM(RTRIM(COALESCE(n.statu, ''))), '') AS constitution,
    NULLIF(LTRIM(RTRIM(COALESCE(n.paccno, ''))), '') AS pan_no,
    NULLIF(LTRIM(RTRIM(COALESCE(n.GSTIN, ''))), '') AS gst_no,
    NULLIF(LTRIM(RTRIM(COALESCE(a.mobile, a.mobile2, itr.PMobileNo, pc.Mobile, a.phone1, a.phone2, ''))), '') AS phone,
    NULLIF(LTRIM(RTRIM(COALESCE(a.mobile, a.mobile2, itr.PMobileNo, pc.Mobile, a.phone1, a.phone2, ''))), '') AS whatsapp,
    NULLIF(LTRIM(RTRIM(COALESCE(a.mailid1, a.mailid2, itr.PEmailId, pc.Email, ''))), '') AS email,
    NULLIF(LTRIM(RTRIM(COALESCE(NULLIF(a.addressof, ''), NULLIF(LTRIM(RTRIM(COALESCE(a.flatno, '') + ' ' + COALESCE(a.bunm, '') + ' ' + COALESCE(a.hno, '') + ' ' + COALESCE(a.street, '') + ' ' + COALESCE(a.area, '') + ' ' + COALESCE(a.city, '') + ' ' + COALESCE(a.district, '') + ' ' + COALESCE(a.state, '') + ' ' + COALESCE(a.pin, ''))), ''), pc.Address, ''))), '') AS address,
    NULLIF(LTRIM(RTRIM(COALESCE(n.businessnm, ''))), '') AS company,
    NULLIF(LTRIM(RTRIM(COALESCE(n.businessnm, ''))), '') AS work_scope,
    COALESCE(n.birth, itr.DOB, pc.DOB) AS birth_date,
    NULLIF(LTRIM(RTRIM(COALESCE(n.nature, ''))), '') AS notes
FROM dbo.pmnam n
OUTER APPLY (
    SELECT TOP 1 *
    FROM dbo.pmadd a
    WHERE a.CodeNo = n.codeno AND ISNULL(a.isdeleted, 0) = 0
    ORDER BY ISNULL(a.IsDefault, 0) DESC, a.addressid
) a
LEFT JOIN dbo.pmContactDetailOnITR itr ON itr.CodeNo = n.codeno
LEFT JOIN dbo.pmcontact pc ON pc.CodeNo = n.codeno
WHERE ISNULL(n.deactive, 0) = 0
  AND n.partyclosedate IS NULL
  AND NULLIF(LTRIM(RTRIM(COALESCE(n.dactdate, ''))), '') IS NULL
  AND (n.tax = 1 OR n.gst = 1 OR n.tds = 1 OR n.ROC = 1 OR n.bal = 1 OR n.srv = 1 OR n.AllSoftware = 1)
  AND NULLIF(LTRIM(RTRIM(COALESCE(n.name, n.businessnm, n.frname, ''))), '') IS NOT NULL
  AND (
      PATINDEX('%[A-Za-z]%', COALESCE(n.name, '')) > 0
      OR PATINDEX('%[A-Za-z]%', COALESCE(n.businessnm, '')) > 0
      OR PATINDEX('%[A-Za-z]%', COALESCE(n.frname, '')) > 0
  )
ORDER BY n.name
"@
}

function Get-ComputaxClientMasterSummarySql {
    return @"
SELECT
    COUNT(*) AS source_total,
    SUM(CASE WHEN ISNULL(n.deactive, 0) = 1 THEN 1 ELSE 0 END) AS excluded_deactive,
    SUM(CASE WHEN n.partyclosedate IS NOT NULL THEN 1 ELSE 0 END) AS excluded_closed,
    SUM(CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(n.dactdate, ''))), '') IS NOT NULL THEN 1 ELSE 0 END) AS excluded_deactivation_date,
    SUM(CASE WHEN NOT (n.tax = 1 OR n.gst = 1 OR n.tds = 1 OR n.ROC = 1 OR n.bal = 1 OR n.srv = 1 OR n.AllSoftware = 1) THEN 1 ELSE 0 END) AS excluded_no_active_module,
    SUM(CASE WHEN ISNULL(n.deactive, 0) = 0
        AND n.partyclosedate IS NULL
        AND NULLIF(LTRIM(RTRIM(COALESCE(n.dactdate, ''))), '') IS NULL
        AND (n.tax = 1 OR n.gst = 1 OR n.tds = 1 OR n.ROC = 1 OR n.bal = 1 OR n.srv = 1 OR n.AllSoftware = 1)
        AND NULLIF(LTRIM(RTRIM(COALESCE(n.name, n.businessnm, n.frname, ''))), '') IS NOT NULL
        AND (
            PATINDEX('%[A-Za-z]%', COALESCE(n.name, '')) > 0
            OR PATINDEX('%[A-Za-z]%', COALESCE(n.businessnm, '')) > 0
            OR PATINDEX('%[A-Za-z]%', COALESCE(n.frname, '')) > 0
        )
    THEN 1 ELSE 0 END) AS exported_by_filter
FROM dbo.pmnam n
"@
}

function Export-Records {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$Sql,
        [string]$SourceName
    )
    $rows = Convert-DataTableRows (Invoke-Table $Connection $Sql)
    $records = @()
    foreach ($row in $rows) {
        $record = Convert-ToBridgeRecord $row $SourceName
        if ($record.name -or $record.pan_no -or $record.gst_no -or $record.phone -or $record.email) {
            $records += [pscustomobject]$record
        }
    }
    return Remove-DuplicateBridgeRecords $records
}

function Push-ToGpa {
    param(
        [object[]]$Records,
        [string]$Url,
        [string]$Username,
        [string]$Password
    )
    if (-not $Url -or -not $Username -or -not $Password) {
        throw "GpaUrl, GpaUsername, and GpaPassword are required for Push mode."
    }
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
    Invoke-RestMethod -Uri "$Url/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session | Out-Null
    $previewBody = @{ records = $Records } | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Uri "$Url/api/external-client-data/preview" -Method Post -ContentType "application/json" -Body $previewBody -WebSession $session
}

$connection = New-Connection
try {
    $sourceSummary = $null
    if ($Mode -eq "Discover") {
        Get-CandidateTables $connection | Select-Object -First 80 | ConvertTo-Json -Depth 4
        return
    }

    if ($Mode -eq "AutoExport" -or $Mode -eq "Push") {
        if (Test-TableExists $connection "dbo" "pmnam") {
            $sql = Get-ComputaxClientMasterSql $Limit
            $sourceSummary = Convert-DataTableRows (Invoke-Table $connection (Get-ComputaxClientMasterSummarySql)) | Select-Object -First 1
            $sourceName = "Computax:dbo.pmnam"
        } else {
            $candidate = Get-CandidateTables $connection | Where-Object { $_.score -ge 4 } | Select-Object -First 1
            if (-not $candidate) {
                throw "No strong Computax client table candidate found. Run Discover and share the output."
            }
            $sql = "SELECT TOP $Limit * FROM [$($candidate.schema)].[$($candidate.table)]"
            $sourceName = "Computax:$($candidate.schema).$($candidate.table)"
        }
        $exportResult = Export-Records $connection $sql $sourceName
    } else {
        if (-not $QueryFile) {
            throw "QueryFile is required for Export mode."
        }
        $sql = Get-Content -LiteralPath $QueryFile -Raw
        $exportResult = Export-Records $connection $sql "Computax:$QueryFile"
    }

    $records = @($exportResult.records)
    if ($Mode -eq "Push") {
        Push-ToGpa $records $GpaUrl $GpaUsername $GpaPassword | ConvertTo-Json -Depth 8
        return
    }

    $records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    [pscustomobject]@{
        success = $true
        records = $records.Count
        duplicates_removed = $exportResult.duplicates_removed
        output = (Resolve-Path $OutputPath).Path
        source_summary = $sourceSummary
    } | ConvertTo-Json -Depth 4
} finally {
    $connection.Close()
}
