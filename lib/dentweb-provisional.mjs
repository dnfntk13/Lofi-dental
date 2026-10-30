import { dentwebIdentityReady, provisionalIdentityReady } from './dentweb-job-identity.mjs';

// Retain an unsubmitted duplicate as cancelled history after a verified time choice.
// Any previous sync attempt requires separate Dentweb verification instead.
export function supersedeProvisional(record, replacement, evidence, now = new Date()) {
  if (!record || !replacement || record.id === replacement.id
    || !provisionalIdentityReady(record) || !provisionalIdentityReady(replacement)
    || record.email.trim().toLowerCase() !== replacement.email.trim().toLowerCase()
    || record.date !== replacement.date || replacement.cancelledAt
    || !String(evidence || '').trim()) throw new Error('Matching duplicate and patient time-choice evidence are required');
  if (record.cancelledAt && record.supersededBy === replacement.id) return record;
  if (record.cancelledAt || record.dentwebReservationId || record.dentwebProcessingAt || record.dentwebQueuedAt
    || record.dentwebSyncedAt || record.dentwebAction || record.dentwebSyncStatus !== 'waiting_identity')
    throw new Error('Only an unsubmitted web request can be superseded; verify previous Dentweb work separately');
  return {...record, status:'cancelled', cancelledAt:now.toISOString(), supersededBy:replacement.id,
    supersededEvidence:String(evidence).trim().slice(0,1000), dentwebSyncStatus:'not_required', updatedAt:now.toISOString()};
}

export function provisionalConflict(record, records) {
  if (dentwebIdentityReady(record) || !provisionalIdentityReady(record) || record.dentwebAction === 'cancel') return false;
  const email = record.email.trim().toLowerCase();
  return records.some(other => other.id !== record.id && !other.cancelledAt
    && other.status !== 'cancelled' && /^\d{4}-\d{2}-\d{2}$/.test(other.date || '')
    && other.date === record.date && String(other.email || '').trim().toLowerCase() === email);
}

// Runs inside the agent's existing serializable web->Dentweb transaction.
// The marker belongs to one web record and email, independent of appointment time.
export const provisionalResolveSql = `
DECLARE @markerId int, @markerCount int, @markerPatient int, @markerStatus tinyint;
IF @identityMarker <> ''
BEGIN
  SELECT @markerId=MIN(nID), @markerCount=COUNT(*), @markerPatient=MIN(n환자ID), @markerStatus=MIN(n이행현황)
  FROM dbo.TB_예약목록 WITH (UPDLOCK,HOLDLOCK)
  WHERE CHARINDEX(@identityMarker,ISNULL(sz메모,''))>0;
  IF @markerCount>1 OR (@markerId IS NOT NULL AND @linkedReservationId>0 AND @markerId<>@linkedReservationId)
    THROW 51010, 'Provisional booking link conflicts; review required.',1;
  IF @markerId IS NOT NULL AND @linkedReservationId=0 SET @linkedReservationId=@markerId;
END;
IF @provisional=1 AND @linkedReservationId>0 AND NOT EXISTS(
  SELECT 1 FROM dbo.TB_예약목록 WHERE nID=@linkedReservationId AND n환자ID<0
    AND CHARINDEX(@identityMarker,ISNULL(sz메모,''))>0)
  THROW 51010,'Provisional booking identity marker mismatch.',1;
`;

export const provisionalUpgradeSql = `
-- Only a marked, still-temporary reservation can acquire verified patient details.
IF @identityMarker<>'' AND @linkedReservationId>0 AND @provisional=0
  AND EXISTS(SELECT 1 FROM dbo.TB_예약목록 WITH(UPDLOCK,HOLDLOCK)
    WHERE nID=@linkedReservationId AND n환자ID<0 AND n이행현황=0
      AND CHARINDEX(@identityMarker,ISNULL(sz메모,''))>0 AND sz이름 LIKE N'가예약 %')
BEGIN
  IF EXISTS(SELECT 1 FROM dbo.TB_예약목록 WITH(UPDLOCK,HOLDLOCK)
    WHERE nID<>@linkedReservationId AND sz예약시각=@appointmentAt
      AND ((@patientId IS NOT NULL AND n환자ID=@patientId)
        OR (LTRIM(RTRIM(sz이름))=@name AND REPLACE(REPLACE(REPLACE(sz전화,'-',''),' ',''),'+','')=@phoneKey)))
    THROW 51004,'Another reservation already exists for this patient and time.',1;
  DECLARE @temporaryPatient int;
  SELECT @temporaryPatient=n환자ID FROM dbo.TB_예약목록 WHERE nID=@linkedReservationId;
  UPDATE dbo.TB_신환예약자정보 SET sz이름=@name,sz휴대폰번호=@phone WHERE nID=-@temporaryPatient;
  UPDATE dbo.TB_예약목록 SET n환자ID=COALESCE(@patientId,n환자ID),sz이름=@name,sz전화=@phone,
    sz메모=REPLACE(ISNULL(sz메모,''),N'가예약 · 이름/전화 미확인',N'웹 가예약 신원 확인 완료')
  WHERE nID=@linkedReservationId;
END;
`;
