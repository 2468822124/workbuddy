# R1 Fix2 Review3 U-8 D 日证据索引

- `reviewId`: `Review3` preparation; this is not the formal Review3 conclusion.
- `reviewMode`: `用户实测 R`
- `item`: `U-8` / `R1-3-T01` cross-natural-day same-plan same-role data-copy reuse
- `captureDate`: `2026-09-03`
- `plan`: `R1-3`
- `role`: `USER`
- `effectiveDate`: `20260903`
- `prefix`: `v0.3-R1-3-USER-20260903`
- `userData`: `E:\workbuddy-test\R1-3&R2-1\B1-20260829\R1-3\USER-20260903\userData`
- `selector`: `E:\workbuddy-test\选择B1实测角色.bat`
- `startupEntry`: `E:\workbuddy-test\启动实测.bat`
- `snapshot`: `QA1/S1`, executable SHA-256 `EEC94A500952CC83A15A9BE1907B0059D8A6262BE63503FA9E54F94716011874`, manifest SHA-256 `0044A2AE3A0075C3733748006308FD3E5F05B19388C5CDEAF02C584DA94FE581`

## D 日操作与结果

1. All WorkBuddy processes were closed before selection. The formal selector was run and `R1-3 / USER` was selected.
2. The selector itself registered a new date copy: `20260903`; it created the isolated `USER-20260903\\userData` directory. No state file or database was edited by hand.
3. The unchanged formal startup entry was run. Its frozen S1 executable and manifest checks passed. The wrapper displayed the expected plan, role, date, prefix, and userData path.
4. In the WorkBuddy GUI, the nickname was saved as `v0.3-R1-3-USER-20260903-BOOT1`; the page displayed the same value in the greeting.
5. WorkBuddy was closed normally, then reopened from the same formal startup entry and the same selected role. The stable `/today` page displayed `v0.3-R1-3-USER-20260903-BOOT1` and `2026 年 9 月 3 日 · 周四`.
6. The application was closed again. No WorkBuddy process remained.

The wrapper was invoked with a process-local system PowerShell module path so its built-in `Get-FileHash` check could run in the Codex host environment. The official selector and startup batch files were not modified, and the startup wrapper still performed the frozen hash comparison before launch.

## Evidence Files

| Evidence | Path | SHA-256 / note |
|---|---|---|
| GUI stable re-entry screenshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-reentry.png` | `428B90AE01B257E5A4F8A6A2968CD88C597DC8C7635B86AA643597E2E6B1862D` |
| Selector registration snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-registered.ini` | `D1C81F8F916CA8FBC25DBDB327DACD378D17DE84C3BAA26C95571C6927BEF1E6` |
| Selected-role snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-selected-role.ini` | `6EC963E82B3EE0320E35D6824271B25852303AEF227B7F2692F2115FB95B42E8` |
| D-day entry-log snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-B1-entry.log` | `1AB3735AABDED337F15BF43E0092B166E772865A023CA41750542FEFC7DF06D9`; R1-3/USER D-day lines are 94-102 in the snapshot |
| Filtered read-only database result | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-readonly.json` | `readOnly=true`, `integrity_check=ok`, `foreign_key_check=[]`, nickname persisted, flow tables empty, main DB hash unchanged |

Main database SHA-256 before and after the read-only check:

`FD0E2C7729EFD4E5224910B2A76D3FFFF46981EA7A58D0B320DF7695767C5698`

The database had `workbuddy.db-wal` and `workbuddy.db-shm` sidecars while inspected; they were not copied or modified.

## Current Gate

- D-day and same-entry persistence: `✅已取得证据`.
- D+1 same-plan same-role reuse: `⚠️待真实自然日复测`.
- Formal Review3: not yet written; Review2 remains `blocked`.
- No `15` freeze and no `14` follow-up plan may start before the D+1 evidence is complete.

## D+1 Required Check

On `2026-09-04`, with WorkBuddy closed, run the same selector and choose `[2] R1-3 / USER`. The required selector result is `Reusing registered date copy: 20260903`. Confirm that `DATE`, `PREFIX`, `userData`, and the BOOT1 value remain unchanged. Then close the app, select a different plan or role once, and confirm its path and prefix are isolated. Preserve the selector output, selected-role state, entry log lines, GUI screenshot, and post-close read-only database hash. Only after that check can the complete Fix2 be formally re-reviewed as `Review3`.

## Supplementary same-day isolation evidence (2026-09-03)

This is auxiliary evidence for the isolation boundary. It does not satisfy the required D+1 natural-day check for R1 U-8 and does not change the Review2 `blocked` state.

1. With WorkBuddy closed, the formal selector was run for `R2-1 / USER`. The first selection registered `20260903`; a second selection of the same plan and role produced `Reusing registered date copy: 20260903 (same plan+role, keep data)` and returned the same prefix and `userData` path.
2. The unchanged formal startup entry launched the frozen QA1/S1 executable. Its entry log recorded `R2-1 / USER`, `20260903`, prefix `v0.3-R2-1-USER-20260903`, the isolated `R2-1\USER-20260903\userData` directory, and the frozen executable and manifest hashes. The GUI displayed `2026 年 9 月 3 日 · 周四`; it was closed normally and no WorkBuddy process remained.
3. The directory map records distinct R1 and R2 USER paths under the same B1 root. The R1 database hash was `FD0E2C7729EFD4E5224910B2A76D3FFFF46981EA7A58D0B320DF7695767C5698`; the R2 database hash was `6A0D743560514DE05EAB5A57EF87683C2A2DED60046AE00DE1E673872D8D02AC`. `sameUserDataPath=false`.
4. R2 read-only verification used `readOnly=true` and `query_only=1`: `integrity_check=ok`, `foreignKeyCheck=[]`, all Flow tables empty, and the database hash was unchanged before/after.

### Supplementary evidence files

| Evidence | Path | SHA-256 |
|---|---|---|
| R2 selector output | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903-selector.log` | `06A958C913CDE655BBFDA87356D6243464F954EE1BC2535ABBE176022B6DC13E` |
| R2 GUI stable startup screenshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903.png` | `CE87DB438240018443246A4DB2B991924663F5220FD50C963C405176EAD12E84` |
| R2 selected-role snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903-selected-role.ini` | `2B385BF6E3013A0A635A97B773FE270DE4B270C4356CDD2F7423D1A9D5229BBB` |
| R2 registered-date snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903-registered.ini` | `D1C81F8F916CA8FBC25DBDB327DACD378D17DE84C3BAA26C95571C6927BEF1E6` |
| R2 entry-log snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903-B1-entry.log` | latest R2 entry is at `2026/09/03 10:42:25` |
| R2 read-only result | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-R2-USER-20260903-readonly.json` | `E9305360CE56B20B66857F5D84C4B8FE218E389F5DBA4550BC6766A2FC477BC8` |
| R1/R2 directory map | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-isolation-directory-map-20260903.json` | `C6ACF78B31556D136D9AB3DE6910FCB16550F9F283E3E3A3F5547B46E9A7714E` |
| R1 same-day selector reuse output | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-same-day-reuse-R1-USER-20260903-selector.log` | `F78D0ACAED794099479A0CEF15E2194B17BA999E0AE6640442770FE8A71F18CC` |
| R1 restored selected-role snapshot | `E:\workspace\GPT实测记录\v0.3实测内容\第1轮\证据\R1-3-T01-C03-GPT-Review3-U8-D0-same-day-reuse-R1-USER-20260903-selected-role.ini` | `A4820563EF05537C2206FF02CA6DBE04E6A948C4C31C2A31E60EE68BC0F5A962` |

The formal Review3 gate remains unchanged: R1 `USER-20260903` must be selected again on `2026-09-04` and the selector must actually report reuse of `20260903` before the complete Fix2 can be concluded.
