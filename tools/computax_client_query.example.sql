SELECT TOP 5000
    ClientCode AS source_id,
    ClientName AS name,
    Constitution AS constitution,
    PAN AS pan_no,
    GSTIN AS gst_no,
    Mobile AS phone,
    Mobile AS whatsapp,
    Email AS email,
    Address AS address,
    DateOfBirth AS birth_date
FROM dbo.ClientMaster;
