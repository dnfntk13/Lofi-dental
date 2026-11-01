// a: locked reservation; p: patient joined by a.n환자ID.
// Registered reservations may omit their denormalized name/phone. Nonblank
// copies must still agree; never fall back to another patient by name alone.
export const cancellationGuardSql = `
a.nID = @linkedReservationId
AND a.n이행현황 IN (0, 2)
AND a.sz예약시각 = @appointmentAt
AND (
  (a.n환자ID > 0 AND p.n환자ID = a.n환자ID
    AND LTRIM(RTRIM(p.sz이름)) = @name
    AND REPLACE(REPLACE(REPLACE(p.sz휴대폰번호, '-', ''), ' ', ''), '+', '')
      = REPLACE(REPLACE(REPLACE(@phone, '-', ''), ' ', ''), '+', '')
    AND (NULLIF(LTRIM(RTRIM(a.sz이름)), '') IS NULL OR LTRIM(RTRIM(a.sz이름)) = @name)
    AND (NULLIF(LTRIM(RTRIM(a.sz전화)), '') IS NULL
      OR REPLACE(REPLACE(REPLACE(a.sz전화, '-', ''), ' ', ''), '+', '')
        = REPLACE(REPLACE(REPLACE(@phone, '-', ''), ' ', ''), '+', '')))
  OR
  (a.n환자ID < 0
    AND LTRIM(RTRIM(a.sz이름)) = @name
    AND REPLACE(REPLACE(REPLACE(a.sz전화, '-', ''), ' ', ''), '+', '')
      = REPLACE(REPLACE(REPLACE(@phone, '-', ''), ' ', ''), '+', ''))
)`;
