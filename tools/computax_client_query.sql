SELECT TOP 15000
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
OUTER APPLY (
    SELECT TOP 1 *
    FROM dbo.pmContactDetailOnITR itr
    WHERE itr.CodeNo = n.codeno
) itr
OUTER APPLY (
    SELECT TOP 1 *
    FROM dbo.pmcontact pc
    WHERE pc.CodeNo = n.codeno
) pc
WHERE ISNULL(n.deactive, 0) = 0
  AND n.partyclosedate IS NULL
  AND NULLIF(LTRIM(RTRIM(COALESCE(n.dactdate, ''))), '') IS NULL
  AND n.ID = (
      SELECT TOP 1 n2.ID
      FROM dbo.pmnam n2
      WHERE LTRIM(RTRIM(n2.codeno)) = LTRIM(RTRIM(n.codeno))
      ORDER BY n2.ID DESC
  )
  AND (n.tax = 1 OR n.gst = 1 OR n.tds = 1 OR n.ROC = 1 OR n.bal = 1 OR n.srv = 1 OR n.AllSoftware = 1)
  AND NULLIF(LTRIM(RTRIM(COALESCE(n.name, n.businessnm, n.frname, ''))), '') IS NOT NULL
  AND (
      PATINDEX('%[A-Za-z]%', COALESCE(n.name, '')) > 0
      OR PATINDEX('%[A-Za-z]%', COALESCE(n.businessnm, '')) > 0
      OR PATINDEX('%[A-Za-z]%', COALESCE(n.frname, '')) > 0
  )
ORDER BY n.name;
