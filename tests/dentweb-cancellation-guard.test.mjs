import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cancellationGuardSql } from '../lib/dentweb-cancellation-guard.mjs';

// Executes the production predicate against synthetic VALUES only. No clinic
// tables are read or written, and the connection string is never printed.
test('SQL cancellation identity guards accept linked blank fields and reject conflicts', {
  skip: !process.env.DENTWEB_SQL_CONNECTION_STRING || process.platform !== 'win32',
}, () => {
  const base = { id: 42, patient: 123, status: 0, at: '203001011400', name: '', phone: '',
    patientId: 123, patientName: 'Test Patient', patientPhone: '010-1111-2222' };
  const cases = [
    ['registered blank fields', {}, 1],
    ['registered null fields', { name: null, phone: null }, 1],
    ['registered matching copies', { name: 'Test Patient', phone: '01011112222' }, 1],
    ['idempotent cancellation', { status: 2 }, 1],
    ['other reservation', { id: 43 }, 0],
    ['changed schedule', { at: '203001011430' }, 0],
    ['attended reservation', { status: 1 }, 0],
    ['unknown status', { status: null }, 0],
    ['missing patient', { patientId: null }, 0],
    ['different linked patient', { patientId: 124 }, 0],
    ['wrong patient name', { patientName: 'Another Patient' }, 0],
    ['wrong patient phone', { patientPhone: '01099992222' }, 0],
    ['conflicting copied name', { name: 'Another Patient' }, 0],
    ['conflicting copied phone', { phone: '01099992222' }, 0],
    ['unregistered matching identity', { patient: -3, name: 'Test Patient', phone: '01011112222' }, 1],
    ['unregistered empty identity', { patient: -3 }, 0],
    ['unregistered wrong phone', { patient: -3, name: 'Test Patient', phone: '01099992222' }, 0],
    ['invalid zero patient', { patient: 0, name: 'Test Patient', phone: '01011112222' }, 0],
    ['missing patient phone', { patientPhone: null }, 0],
  ];
  const literal = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `N'${v.replaceAll("'", "''")}'`;
  const rows = cases.map(([label, changes, expected]) => {
    const row = { ...base, ...changes };
    return '(' + [label, expected, ...Object.keys(base).map(k => row[k])].map(literal).join(',') + ')';
  });
  const sql = `DECLARE @linkedReservationId int=42, @appointmentAt varchar(12)='203001011400',
    @name nvarchar(40)=N'Test Patient', @phone varchar(30)='010-1111-2222';
    SELECT a.label,a.expected,CASE WHEN ${cancellationGuardSql} THEN 1 ELSE 0 END AS actual
    FROM (VALUES ${rows.join(',\n')}) a(label,expected,nID,n환자ID,n이행현황,sz예약시각,sz이름,sz전화,patientId,patientName,patientPhone)
    CROSS APPLY (SELECT a.patientId AS n환자ID,a.patientName AS sz이름,a.patientPhone AS sz휴대폰번호) p;`;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dentweb-cancel-test-'));
  try {
    const sqlPath = path.join(dir, 'fixture.sql'), outPath = path.join(dir, 'result.json');
    writeFileSync(sqlPath, sql, 'utf8');
    const ps = `$ErrorActionPreference='Stop'; $cx=[Data.SqlClient.SqlConnection]::new($env:DENTWEB_SQL_CONNECTION_STRING); try {
      $cx.Open(); $cmd=$cx.CreateCommand(); $cmd.CommandText=[IO.File]::ReadAllText('${sqlPath.replaceAll("'", "''")}');
      $t=[Data.DataTable]::new(); $da=[Data.SqlClient.SqlDataAdapter]::new($cmd); [void]$da.Fill($t);
      $rows=@($t|ForEach-Object {@{label=$_.label;expected=$_.expected;actual=$_.actual}});
      [IO.File]::WriteAllText('${outPath.replaceAll("'", "''")}',(ConvertTo-Json -InputObject $rows));
    } finally {$cx.Dispose()}`;
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 30000, stdio: 'pipe' });
    const results = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(results.length, cases.length);
    for (const row of results) assert.equal(row.actual, row.expected, row.label);
  } finally {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
    assert.ok(relative.startsWith('dentweb-cancel-test-') && !relative.includes(path.sep));
    rmSync(dir, { recursive: true, force: true });
  }
});
