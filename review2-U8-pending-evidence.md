# Review2 U-8 pending evidence

- reviewId: `Review2`
- R/Fix: `R1 Fix2`
- item: `U-8` / cross-natural-day same-plan same-role test-data reuse
- status: `⚠️待用户实测`

## What was checked

- The approved selector artifact is `E:\workbuddy-test\选择B1实测角色.bat`.
- Its registered-date lookup and data-directory existence guard are present; reuse is limited to the same plan and role.
- The 07 sandbox evidence is retained at `E:\workbuddy-test\R1-3&R2-1\B1-20260829\entry\evidence\U8-Fix2-selector-sandbox-evidence.txt` and is auxiliary only.
- This Review2 run did not modify the formal `E:\workbuddy-test` selection state or any B1 role data.

## Why it cannot be marked passed

The acceptance condition is a real next-natural-day selection of the same plan and role, followed by the unchanged registered date/prefix and retained data. The current desktop date is one fixed instant; advancing the system clock or waiting until another natural day would change external desktop state or leave the review incomplete. A same-day replay or selector sandbox is not equivalent evidence, so neither is promoted to a GUI pass.

## User reproduction required

1. On day D, use the formal selector and choose the same plan/role; record the effective `DATE`, `PREFIX`, and database path.
2. Close WorkBuddy and leave the selected test data intact.
3. On the next natural day D+1, run the same formal selector and choose the same plan/role again.
4. Confirm it reports reuse of the registered D date, keeps the same `PREFIX` and database path, and the application opens with the prior data still present.
5. Choose a different role or plan and confirm its data prefix/path remains isolated.
6. Return the screenshots, selector output, entry state, and read-only database hash before/after to the R1 closure record.

Until that evidence exists, U-8 blocks a `✅通过（修复复审）` conclusion and no 15 freeze may start.
