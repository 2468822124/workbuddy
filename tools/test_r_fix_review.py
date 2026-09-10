import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SCRIPT = Path(__file__).with_name("r_fix_review.py")


class RFixReviewWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.code = self.root / "workbuddy"
        self.review = self.root / "review"
        self.snapshots = self.root / "snapshots"
        (self.code / "src").mkdir(parents=True)
        (self.code / "src" / "base.txt").write_text("base\n", encoding="utf-8")
        (self.code / "src" / "untouched.txt").write_text("untouched\n", encoding="utf-8")
        self.git(["init", "-q"])
        self.git(["config", "user.email", "test@example.invalid"])
        self.git(["config", "user.name", "Workflow Test"])
        self.git(["add", "workbuddy/src/base.txt", "workbuddy/src/untouched.txt"])
        self.git(["commit", "-qm", "base"])
        self.base_commit = self.git(["rev-parse", "HEAD"]).stdout.strip()
        self.call(
            "register-development-baseline",
            "--registration-kind",
            "c0",
            "--reason",
            "test C0 baseline",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def git(self, arguments):
        return subprocess.run(
            ["git", *arguments],
            cwd=self.root,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def call(self, command, *arguments, expected=0):
        roots = [
            "--workspace-root",
            str(self.root),
            "--code-root",
            str(self.code),
            "--review-root",
            str(self.review),
            "--snapshot-root",
            str(self.snapshots),
        ]
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), command, *roots, *arguments],
            cwd=self.root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if completed.returncode != expected:
            self.fail(
                f"{command} returned {completed.returncode}, expected {expected}\n"
                f"stdout={completed.stdout}\nstderr={completed.stderr}"
            )
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise self.failureException(
                f"{command} did not return JSON: {completed.stdout}"
            ) from exc

    def create_build(self, name, content):
        build = self.root / "builds" / name
        (build / "app").mkdir(parents=True)
        (build / "app" / "marker.txt").write_text(content, encoding="utf-8")
        return build

    def load_tool_module(self):
        spec = importlib.util.spec_from_file_location("r_fix_review_test_module", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def complete_candidate(self, r_id, fix_id, source_file, marker, review_status="passed"):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            r_id,
            "--fix-id",
            fix_id,
        )
        target = self.code / Path(source_file)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(marker + "\n", encoding="utf-8")
        build = self.create_build(r_id, marker)
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            r_id,
            "--fix-id",
            fix_id,
            "--build-dir",
            str(build),
            "--allowed-source-file",
            source_file,
            "--allowed-worktree-file",
            source_file,
        )
        candidate = Path(result["candidate"]["candidateDir"])
        evidence = candidate / "evidence" / "gui.json"
        evidence.write_text('{"evidence":"test"}\n', encoding="utf-8")
        review_args = [
            "set-review-status",
            "--batch-id",
            "B1",
            "--r-id",
            r_id,
            "--fix-id",
            fix_id,
            "--review-id",
            "Review1" if r_id == "R1" else "Review2",
            "--status",
            review_status,
        ]
        if review_status == "passed":
            review_args.extend(["--evidence", str(evidence)])
        self.call(*review_args)
        return candidate

    def make_legacy_candidate_without_source_artifacts(self, candidate):
        """Model a pre-source-package candidate without rewriting its history."""
        source_tree = candidate / "control" / "source-tree"
        recovery_source = self.root / f"{candidate.name}-recovered-source"
        shutil.copytree(source_tree, recovery_source)
        tool = self.load_tool_module()
        tool.remove_tree(source_tree)
        (candidate / "control" / "approved-source-diff.json").unlink()
        meta_path = candidate / "review-meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        for key in (
            "candidateSourceTreePath",
            "candidateSourceTreeFingerprint",
            "approvedSourceDiffPath",
            "approvedSourceDiffSha256",
        ):
            meta.pop(key, None)
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return recovery_source

    def test_fix_restores_exact_pre_fix_state_and_is_idempotent(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        changed = self.code / "src" / "r1.txt"
        changed.write_text("R1 change\n", encoding="utf-8")
        build = self.create_build("r1", "r1")
        first = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/r1.txt",
            "--allowed-worktree-file",
            "src/r1.txt",
        )
        self.assertEqual(first["restore"]["restoreStatus"], "verified")
        self.assertFalse(changed.exists())
        self.assertEqual(self.git(["status", "--porcelain", "--", "workbuddy"]).stdout, "")
        candidate = Path(first["candidate"]["candidateDir"])
        original_meta = (candidate / "review-meta.json").read_bytes()
        second = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/r1.txt",
            "--allowed-worktree-file",
            "src/r1.txt",
        )
        self.assertTrue(second["idempotent"])
        self.assertEqual(original_meta, (candidate / "review-meta.json").read_bytes())
        tampered = json.loads((candidate / "review-meta.json").read_text(encoding="utf-8"))
        tampered["restoreStatus"] = "pending"
        (candidate / "review-meta.json").write_text(
            json.dumps(tampered, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        blocked = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/r1.txt",
            "--allowed-worktree-file",
            "src/r1.txt",
            expected=2,
        )
        self.assertIn("restore is not verified", blocked["error"])

    def test_review_statuses_are_append_only_across_review_rounds(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        primary = candidate / "control" / "review-status.json"
        primary_before = primary.read_bytes()
        second_evidence = candidate / "evidence" / "review2.json"
        second_evidence.write_text('{"evidence":"review2"}\n', encoding="utf-8")

        second = self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--review-id",
            "Review2",
            "--status",
            "passed",
            "--evidence",
            str(second_evidence),
        )

        self.assertFalse(second["idempotent"])
        self.assertEqual(primary.read_bytes(), primary_before)
        named = candidate / "control" / "review-status-Review2.json"
        self.assertTrue(named.is_file())
        self.assertEqual(json.loads(named.read_text(encoding="utf-8"))["reviewId"], "Review2")
        repeated = self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--review-id",
            "Review2",
            "--status",
            "passed",
            "--evidence",
            str(second_evidence),
        )
        self.assertTrue(repeated["idempotent"])

    def test_r_only_candidate_contains_only_this_fix(self):
        r1 = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        r1_meta = json.loads((r1 / "review-meta.json").read_text(encoding="utf-8"))
        self.assertEqual(r1_meta["candidateChangedFiles"], ["src/r1.txt"])
        self.assertEqual(r1_meta["worktreeChangedFiles"], ["src/r1.txt"])
        self.assertEqual(
            (r1 / "control" / "candidate-source-manifest.json").exists(),
            True,
        )
        self.assertFalse((r1 / "app" / "r2.txt").exists())

        r2 = self.complete_candidate("R2", "Fix1", "src/r2.txt", "r2")
        r2_meta = json.loads((r2 / "review-meta.json").read_text(encoding="utf-8"))
        self.assertEqual(r2_meta["candidateChangedFiles"], ["src/r2.txt"])
        self.assertFalse((r2 / "app" / "r1.txt").exists())
        self.assertFalse((self.code / "src" / "r1.txt").exists())
        self.assertFalse((self.code / "src" / "r2.txt").exists())

    def test_external_candidate_source_is_checked_against_c0(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        external = self.root / "candidate-source" / "r1"
        shutil.copytree(self.code, external)
        (external / "src" / "r1.txt").write_text("external R1\n", encoding="utf-8")
        build = self.create_build("external-r1", "external")
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--candidate-source",
            str(external),
            "--candidate-base-commit",
            self.base_commit,
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/r1.txt",
        )
        self.assertEqual(result["candidate"]["candidateChangedFiles"], ["src/r1.txt"])
        self.assertFalse((self.code / "src" / "r1.txt").exists())

    def test_unowned_change_blocks_without_restoring(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        owned = self.code / "src" / "owned.txt"
        unknown = self.code / "src" / "unknown.txt"
        owned.write_text("owned\n", encoding="utf-8")
        unknown.write_text("unknown\n", encoding="utf-8")
        build = self.create_build("blocked", "blocked")
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/owned.txt",
            "--allowed-worktree-file",
            "src/owned.txt",
            expected=2,
        )
        self.assertFalse(result["ok"])
        self.assertIn("unowned Fix changes", result["error"])
        self.assertTrue(owned.exists())
        self.assertTrue(unknown.exists())
        self.assertFalse((self.review / "B1" / "R1-Fix1-only").exists())

    def test_outside_index_change_blocks_without_touching_staged_user_work(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        owned = self.code / "src" / "owned.txt"
        owned.write_text("owned\n", encoding="utf-8")
        outside = self.root / "governance-note.md"
        outside.write_text("user staged note\n", encoding="utf-8")
        self.git(["add", "governance-note.md"])
        build = self.create_build("outside-index", "blocked")
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/owned.txt",
            "--allowed-worktree-file",
            "src/owned.txt",
            expected=2,
        )
        self.assertFalse(result["ok"])
        self.assertIn("index entries outside", result["error"])
        self.assertTrue(owned.exists())
        self.assertFalse((self.review / "B1" / "R1-Fix1-only").exists())
        self.assertIn("A  governance-note.md", self.git(["status", "--porcelain"]).stdout)

    def test_different_r_fixes_are_serial_on_one_development_worktree(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        blocked = self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R2",
            "--fix-id",
            "Fix1",
            expected=2,
        )
        self.assertFalse(blocked["ok"])
        self.assertIn("already owns the development worktree", blocked["error"])

    def test_dynamic_batch_gate_rejects_missing_unregistered_and_duplicate_r(self):
        self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--expected",
            "R2:Fix1",
        )
        pending = self.call("scan-batch", "--batch-id", "B1")
        self.assertFalse(pending["readyToMerge"])
        self.assertIn("missing-R-only", {item["code"] for item in pending["scan"]["issues"]})

        unexpected = self.review / "B1" / "R3-Fix1-only"
        unexpected.mkdir()
        blocked = self.call("scan-batch", "--batch-id", "B1")
        codes = {item["code"] for item in blocked["scan"]["issues"]}
        self.assertIn("unregistered-R", codes)

        orphan = self.review / "B1" / "orphan"
        orphan.mkdir()
        orphan_scan = self.call("scan-batch", "--batch-id", "B1")
        codes = {item["code"] for item in orphan_scan["scan"]["issues"]}
        self.assertIn("unregistered-or-malformed-R-directory", codes)

        duplicate = self.review / "B1" / "R1-Fix2-only"
        duplicate.mkdir()
        duplicate_scan = self.call("scan-batch", "--batch-id", "B1")
        codes = {item["code"] for item in duplicate_scan["scan"]["issues"]}
        self.assertIn("duplicate-R", codes)

    def test_overlapping_merge_file_requires_explicit_resolution(self):
        self.complete_candidate("R1", "Fix1", "src/shared.txt", "r1")
        self.complete_candidate("R2", "Fix1", "src/shared.txt", "r2")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--expected",
            "R2:Fix1",
            "--base-commit",
            self.base_commit,
        )
        self.call("prepare-merge", "--batch-id", "B1")
        (self.code / "src" / "shared.txt").write_text("r1\n", encoding="utf-8")
        build = self.create_build("overlap-merge", "merge")
        blocked = self.call(
            "complete-merge",
            "--batch-id",
            "B1",
            "--build-dir",
            str(build),
            expected=2,
        )
        self.assertIn("requires explicit", blocked["error"])
        result = self.call(
            "complete-merge",
            "--batch-id",
            "B1",
            "--build-dir",
            str(build),
            "--merge-resolution-file",
            "src/shared.txt",
        )
        self.assertEqual(result["candidate"]["restoreStatus"], "not-applicable-after-merge")

    def test_all_r_reviews_gate_merge_and_merge_preserves_worktree(self):
        self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.complete_candidate("R2", "Fix1", "src/r2.txt", "r2")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--expected",
            "R2:Fix1",
            "--base-commit",
            self.base_commit,
        )
        scan = self.call("scan-batch", "--batch-id", "B1")
        self.assertTrue(scan["readyToMerge"])
        handoff = self.call("prepare-merge", "--batch-id", "B1")
        self.assertEqual(handoff["handoff"]["status"], "ready-for-ds-integration")

        (self.code / "src" / "r1.txt").write_text("r1\n", encoding="utf-8")
        (self.code / "src" / "r2.txt").write_text("r2\n", encoding="utf-8")
        build = self.create_build("merge", "merge")
        result = self.call(
            "complete-merge",
            "--batch-id",
            "B1",
            "--build-dir",
            str(build),
        )
        self.assertEqual(
            result["candidate"]["restoreStatus"],
            "not-applicable-after-merge",
        )
        self.assertTrue((self.code / "src" / "r1.txt").exists())
        self.assertTrue((self.code / "src" / "r2.txt").exists())
        self.assertNotEqual(self.git(["status", "--porcelain", "--", "workbuddy"]).stdout, "")

        merge = self.review / "B1" / "merge"
        evidence = merge / "evidence" / "merge-gui.json"
        evidence.write_text('{"evidence":"merge"}\n', encoding="utf-8")
        self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--candidate-kind",
            "merge",
            "--review-id",
            "B1-Merge-Review1",
            "--status",
            "passed",
            "--evidence",
            str(evidence),
        )
        document = (
            self.root
            / "用户实测阶段"
            / "v0.3-任务数据流通重构"
            / "合并复审"
            / "B1-merge的全流程闭环.md"
        )
        created = self.call(
            "create-merge-document",
            "--batch-id",
            "B1",
            "--document",
            str(document),
        )
        self.assertTrue(created["created"])
        self.assertIn(
            "<!-- r-fix-review-batch: B1 -->",
            document.read_text(encoding="utf-8"),
        )
        verified = self.call(
            "create-merge-document",
            "--batch-id",
            "B1",
            "--document",
            str(document),
        )
        self.assertFalse(verified["created"])

    def test_sync_direct_candidate_updates_only_approved_files_and_is_idempotent(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        before_unrelated = self.code / "src" / "untouched.txt"
        before_unrelated.write_text("user-owned change\n", encoding="utf-8")
        result = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
        )
        self.assertTrue(result["ok"])
        self.assertFalse(result["result"].get("idempotent", False))
        self.assertEqual((self.code / "src" / "r1.txt").read_text(encoding="utf-8"), "r1\n")
        self.assertEqual(before_unrelated.read_text(encoding="utf-8"), "user-owned change\n")
        sync_result = self.review / "B1" / "control" / "source-sync-result.json"
        pointer = self.review / "current-development-pointer.json"
        state = self.review / "B1" / "control" / "batch-state.json"
        self.assertEqual(json.loads(sync_result.read_text(encoding="utf-8"))["sourceSyncStatus"], "verified")
        self.assertEqual(json.loads(pointer.read_text(encoding="utf-8"))["sourceSyncStatus"], "verified")
        self.assertEqual(json.loads(state.read_text(encoding="utf-8"))["operationalClosureStatus"], "verified")
        package_dir = self.snapshots / "B1-R1-Fix1-only-source-sync"
        self.assertTrue((package_dir / "source-tree" / "src" / "r1.txt").is_file())
        tool = self.load_tool_module()
        package_record = json.loads(
            (package_dir / "control" / "source-package-record.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            tool.sha256_file(Path(package_record["sourceManifestPath"])),
            package_record["sourceManifestSha256"],
        )
        current = tool.capture_code_state(self.code)
        pointer_record = json.loads(pointer.read_text(encoding="utf-8"))
        sync_record = json.loads(sync_result.read_text(encoding="utf-8"))
        self.assertEqual(pointer_record["workspaceFingerprint"], current["workspaceFingerprint"])
        self.assertEqual(sync_record["afterWorkspaceFingerprint"], current["workspaceFingerprint"])
        self.assertTrue(
            all(
                not (path.stat().st_mode & 0o222)
                for path in package_dir.rglob("*")
                if path.is_file() or path.is_dir()
            )
        )
        repeated = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
        )
        self.assertTrue(repeated["idempotent"])

    def test_sync_rejects_review_that_is_not_passed(self):
        candidate = self.complete_candidate(
            "R1", "Fix1", "src/r1.txt", "r1", review_status="blocked"
        )
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=2,
        )
        self.assertIn("not passed", blocked["error"])
        self.assertEqual(blocked["result"]["sourceSyncStatus"], "blocked")
        sync_result = self.review / "B1" / "control" / "source-sync-result.json"
        self.assertEqual(
            json.loads(sync_result.read_text(encoding="utf-8"))["sourceSyncStatus"],
            "blocked",
        )

    def test_sync_rejects_build_manifest_tampering(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        build_manifest = candidate / "control" / "build-manifest.json"
        payload = json.loads(build_manifest.read_text(encoding="utf-8"))
        payload["files"][0]["sha256"] = "0" * 64
        build_manifest.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=2,
        )
        self.assertIn("build-manifest-mismatch", blocked["error"])
        self.assertEqual(blocked["result"]["sourceSyncStatus"], "blocked")

    def test_sync_preserves_historical_candidate_entry_snapshot_and_evidence_assets(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        historical_candidate = self.review / "B1" / "R0-Fix0-only"
        historical_candidate.mkdir()
        (historical_candidate / "review-meta.json").write_text(
            "historical candidate\n", encoding="utf-8"
        )
        historical_entry = self.root / "B1-historical-entry"
        historical_entry.mkdir()
        (historical_entry / "launch.log").write_text("entry\n", encoding="utf-8")
        historical_s1 = self.root / "B1-S1-history"
        historical_s1.mkdir()
        (historical_s1 / "S1-manifest.sha256").write_text("s1\n", encoding="utf-8")
        historical_evidence = self.root / "B1-historical-evidence"
        historical_evidence.mkdir()
        (historical_evidence / "review.json").write_text("evidence\n", encoding="utf-8")
        before = {
            path: path.read_bytes()
            for path in (
                historical_candidate / "review-meta.json",
                historical_entry / "launch.log",
                historical_s1 / "S1-manifest.sha256",
                historical_evidence / "review.json",
            )
        }
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
            "--exclude-r-only",
            "R0-Fix0-only",
            "--exclude-reason",
            "historical candidate retained for non-destructive audit coverage",
        )
        self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
        )
        self.assertEqual(
            before,
            {
                path: path.read_bytes()
                for path in before
            },
        )

    def test_sync_rejects_multi_r_only_candidate_and_accepts_final_merge(self):
        r1 = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.complete_candidate("R2", "Fix1", "src/r2.txt", "r2")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--expected",
            "R2:Fix1",
            "--candidate-strategy",
            "merge",
            "--base-commit",
            self.base_commit,
        )
        rejected = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "merge",
            "--candidate-dir",
            str(r1),
            "--review-status",
            str(r1 / "control" / "review-status.json"),
            expected=2,
        )
        self.assertIn("candidateType=merge", rejected["error"])
        self.call("prepare-merge", "--batch-id", "B1")
        (self.code / "src" / "r1.txt").write_text("r1\n", encoding="utf-8")
        (self.code / "src" / "r2.txt").write_text("r2\n", encoding="utf-8")
        build = self.create_build("merge-sync", "merge")
        self.call("complete-merge", "--batch-id", "B1", "--build-dir", str(build))
        merge = self.review / "B1" / "merge"
        evidence = merge / "evidence" / "merge.json"
        evidence.write_text("merge evidence\n", encoding="utf-8")
        self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--candidate-kind",
            "merge",
            "--review-id",
            "B1-Merge-Review1",
            "--status",
            "passed",
            "--evidence",
            str(evidence),
        )
        synced = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "merge",
            "--candidate-dir",
            str(merge),
            "--review-status",
            str(merge / "control" / "review-status.json"),
        )
        self.assertTrue(synced["ok"])
        self.assertEqual(synced["result"]["syncMode"], "verified-existing")

    def test_sync_rejects_source_manifest_tampering(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        meta_path = candidate / "review-meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["candidateSourceManifestSha256"] = "0" * 64
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=2,
        )
        self.assertIn("manifest hash mismatch", blocked["error"])

    def test_sync_rejects_approved_source_diff_tampering(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        diff_path = candidate / "control" / "approved-source-diff.json"
        diff = json.loads(diff_path.read_text(encoding="utf-8"))
        diff["approvedDiffFingerprint"] = "0" * 64
        diff_path.write_text(
            json.dumps(diff, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=2,
        )
        self.assertIn("approved source diff hash mismatch", blocked["error"])
        self.assertEqual(blocked["result"]["sourceSyncStatus"], "blocked")

    def test_sync_blocks_approved_file_conflict_and_preserves_it(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        conflicted = self.code / "src" / "r1.txt"
        conflicted.write_text("other change\n", encoding="utf-8")
        result = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=3,
        )
        self.assertFalse(result["ok"])
        self.assertIn("src/r1.txt", result["result"]["conflicts"])
        self.assertEqual(conflicted.read_text(encoding="utf-8"), "other change\n")
        self.assertEqual(
            json.loads((self.review / "B1" / "control" / "batch-state.json").read_text(encoding="utf-8"))["operationalClosureStatus"],
            "blocked",
        )

    def test_sync_handles_new_and_deleted_files_and_index_conflict(self):
        new_candidate = self.complete_candidate("R1", "Fix1", "src/new.txt", "new")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        staged = self.code / "src" / "new.txt"
        staged.write_text("staged different\n", encoding="utf-8")
        self.git(["add", "workbuddy/src/new.txt"])
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(new_candidate),
            "--review-status",
            str(new_candidate / "control" / "review-status.json"),
            expected=3,
        )
        self.assertIn("src/new.txt", blocked["result"]["conflicts"])

        # A fresh fixture is not available inside this test, so use the same
        # candidate only to verify that the staged conflict did not overwrite
        # the user-owned content.
        self.assertEqual(staged.read_text(encoding="utf-8"), "staged different\n")

    def test_sync_blocks_new_file_directory_conflict_without_removing_user_directory(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/new.txt", "new")
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        target = self.code / "src" / "new.txt"
        target.mkdir()
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            expected=3,
        )
        self.assertIn("src/new.txt", blocked["result"]["conflicts"])
        self.assertTrue(target.is_dir())

    def test_sync_applies_approved_file_deletion(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        (self.code / "src" / "base.txt").unlink()
        build = self.create_build("delete", "delete")
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/base.txt",
        )
        candidate = Path(result["candidate"]["candidateDir"])
        evidence = candidate / "evidence" / "delete.json"
        evidence.write_text("evidence\n", encoding="utf-8")
        self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--review-id",
            "Review1",
            "--status",
            "passed",
            "--evidence",
            str(evidence),
        )
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        synced = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
        )
        self.assertTrue(synced["ok"])
        self.assertFalse((self.code / "src" / "base.txt").exists())

    def test_sync_rolls_back_when_a_later_approved_write_fails(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        first = self.code / "src" / "a-new.txt"
        second = self.code / "src" / "b-new.txt"
        first.write_text("a\n", encoding="utf-8")
        second.write_text("b\n", encoding="utf-8")
        build = self.create_build("rollback", "rollback")
        result = self.call(
            "complete-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--build-dir",
            str(build),
            "--allowed-source-file",
            "src/a-new.txt",
            "--allowed-source-file",
            "src/b-new.txt",
            "--allowed-worktree-file",
            "src/a-new.txt",
            "--allowed-worktree-file",
            "src/b-new.txt",
        )
        candidate = Path(result["candidate"]["candidateDir"])
        evidence = candidate / "evidence" / "rollback.json"
        evidence.write_text("evidence\n", encoding="utf-8")
        self.call(
            "set-review-status",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            "--review-id",
            "Review1",
            "--status",
            "passed",
            "--evidence",
            str(evidence),
        )
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        tool = self.load_tool_module()
        arguments = SimpleNamespace(
            workspace_root=str(self.root),
            code_root=str(self.code),
            review_root=str(self.review),
            snapshot_root=str(self.snapshots),
            batch_id="B1",
            candidate_strategy="direct",
            candidate_dir=str(candidate),
            review_status=str(candidate / "control" / "review-status.json"),
            source_payload_dir=None,
        )
        original_apply = tool.apply_sync_diff

        def fail_after_first(code_root, source_root, changed):
            first_path = sorted(changed)[0]
            original_apply(code_root, source_root, {first_path: changed[first_path]})
            raise OSError("simulated later approved write failure")

        with mock.patch.object(tool, "apply_sync_diff", side_effect=fail_after_first):
            with self.assertRaises(tool.WorkflowError) as failure:
                tool.sync_final_candidate(arguments)
        self.assertIn("rolled back", str(failure.exception))
        self.assertFalse((self.code / "src" / "a-new.txt").exists())
        self.assertFalse((self.code / "src" / "b-new.txt").exists())

    def test_begin_fix_requires_matching_development_pointer(self):
        changed = self.code / "src" / "unregistered-after-c0.txt"
        changed.write_text("changed\n", encoding="utf-8")
        blocked = self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            expected=2,
        )
        self.assertIn("current-development-pointer", blocked["error"])

    def test_existing_begin_fix_still_requires_matching_development_pointer(self):
        self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
        )
        pointer_path = self.review / "current-development-pointer.json"
        pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
        pointer["workspaceFingerprint"] = "tampered-pointer-fingerprint"
        pointer_path.write_text(
            json.dumps(pointer, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        blocked = self.call(
            "begin-fix",
            "--batch-id",
            "B1",
            "--r-id",
            "R1",
            "--fix-id",
            "Fix1",
            expected=2,
        )
        self.assertIn("development worktree does not match current-development-pointer.json", blocked["error"])

    def test_history_source_recovery_requires_complete_source_and_is_idempotent(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        incomplete = self.root / "historical-source-incomplete"
        (incomplete / "src").mkdir(parents=True)
        (incomplete / "src" / "base.txt").write_text("base\n", encoding="utf-8")
        blocked = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(incomplete),
            "--required-source-file",
            "tests/r1Fix2.spec.ts",
            expected=2,
        )
        self.assertIn("tests/r1Fix2.spec.ts", blocked["error"])
        recovery_source = self.root / "historical-source-complete"
        shutil.copytree(candidate / "control" / "source-tree", recovery_source)
        recovered = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
        )
        self.assertEqual(recovered["result"]["sourceRecoveryStatus"], "verified")
        recovery_dir = self.snapshots / "B1-R1-Fix1-only-source-recovery"
        self.assertTrue((recovery_dir / "source-tree" / "src" / "r1.txt").is_file())
        self.assertTrue(
            all(
                not (path.stat().st_mode & 0o222)
                for path in recovery_dir.rglob("*")
                if path.is_file() or path.is_dir()
            )
        )
        repeated = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
        )
        self.assertTrue(repeated["idempotent"])

    def test_legacy_history_recovery_reconstructs_diff_without_mutating_candidate(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        recovery_source = self.make_legacy_candidate_without_source_artifacts(candidate)
        evidence = self.root / "audited-edit-log.jsonl"
        evidence.write_text('{"tool":"Edit"}\n', encoding="utf-8")
        before = {
            path.relative_to(candidate).as_posix(): path.read_bytes()
            for path in candidate.rglob("*")
            if path.is_file()
        }

        recovered = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
            "--source-evidence",
            str(evidence),
            "--reconstruction-note",
            "replayed audited Edit operations 10-20 over the begin snapshot",
        )

        self.assertEqual(recovered["result"]["sourceRecoveryStatus"], "verified")
        self.assertEqual(
            recovered["result"]["approvedDiffOrigin"],
            "reconstructed-from-begin-baseline",
        )
        self.assertEqual(
            recovered["result"]["sourceEvidenceRecords"][0]["path"],
            str(evidence.resolve()),
        )
        self.assertTrue(recovered["result"]["baselineSnapshotVerified"])
        recovery_dir = self.snapshots / "B1-R1-Fix1-only-source-recovery"
        self.assertTrue((recovery_dir / "control" / "approved-source-diff.json").is_file())
        self.assertFalse((candidate / "control" / "approved-source-diff.json").exists())
        self.assertFalse((candidate / "control" / "source-tree").exists())
        self.assertEqual(
            before,
            {
                path.relative_to(candidate).as_posix(): path.read_bytes()
                for path in candidate.rglob("*")
                if path.is_file()
            },
        )

    def test_legacy_history_recovery_rejects_frozen_diff_fingerprint_mismatch(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        recovery_source = self.make_legacy_candidate_without_source_artifacts(candidate)
        meta_path = candidate / "review-meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["approvedDiffFingerprint"] = "0" * 64
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        blocked = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
            expected=2,
        )

        self.assertIn("approved diff fingerprint", blocked["error"])
        self.assertFalse(
            (self.snapshots / "B1-R1-Fix1-only-source-recovery").exists()
        )

    def test_legacy_history_recovery_rejects_modified_recovery_diff(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        recovery_source = self.make_legacy_candidate_without_source_artifacts(candidate)
        self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
        )
        recovery_dir = self.snapshots / "B1-R1-Fix1-only-source-recovery"
        diff_path = recovery_dir / "control" / "approved-source-diff.json"
        tool = self.load_tool_module()
        tool.make_tree_writable(recovery_dir)
        diff_path.write_bytes(diff_path.read_bytes() + b"\n")
        tool.make_tree_readonly(recovery_dir)

        blocked = self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
            expected=2,
        )

        self.assertIn("approved source diff hash mismatch", blocked["error"])

    def test_sync_autodiscovers_verified_legacy_recovery_package(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        recovery_source = self.make_legacy_candidate_without_source_artifacts(candidate)
        self.call(
            "recover-history-source-package",
            "--batch-id",
            "B1",
            "--candidate-dir",
            str(candidate),
            "--source-dir",
            str(recovery_source),
            "--required-source-file",
            "src/r1.txt",
        )
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        scan = self.call("scan-batch", "--batch-id", "B1")
        self.assertTrue(scan["readyToFinalSync"])
        self.assertEqual(scan["scan"]["status"], "ready-for-final-sync")
        self.assertEqual(scan["scan"]["nextAction"], "15A-sync-final-candidate")
        self.assertEqual(
            scan["scan"]["historySourceRecoveryPackages"][0]["candidateDir"],
            str(candidate.resolve()),
        )
        state = json.loads(
            (self.review / "B1" / "control" / "batch-state.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(state["nextAction"], "15A-sync-final-candidate")

        synced = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
        )

        self.assertTrue(synced["ok"])
        self.assertEqual(
            synced["result"]["sourceValidation"]["approvedDiffOrigin"],
            "verified-history-recovery",
        )
        self.assertEqual(
            (self.code / "src" / "r1.txt").read_text(encoding="utf-8"),
            "r1\n",
        )

    def test_exact_excluded_historical_candidate_is_not_scanned(self):
        self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        self.complete_candidate("R2", "Fix1", "src/r2.txt", "r2")
        excluded = self.review / "B1" / "R3-Fix1-only"
        excluded.mkdir(parents=True)
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--expected",
            "R2:Fix1",
            "--candidate-strategy",
            "merge",
            "--base-commit",
            self.base_commit,
            "--exclude-r-only",
            "R3-Fix1-only",
            "--exclude-reason",
            "GPT越权产生的作废历史资产",
        )
        scan = self.call("scan-batch", "--batch-id", "B1")
        self.assertTrue(scan["readyToMerge"])
        self.assertNotIn("unregistered-R", {item["code"] for item in scan["scan"]["issues"]})
        self.assertIn("R3-Fix1-only", scan["scan"]["excludedROnlyDirectories"])

    def test_legacy_source_payload_missing_file_is_blocked(self):
        candidate = self.complete_candidate("R1", "Fix1", "src/r1.txt", "r1")
        source_tree = candidate / "control" / "source-tree"
        # Keep the candidate's immutable record but force the audited legacy
        # payload path, which is intentionally incomplete.
        for item in source_tree.rglob("*"):
            item.chmod(item.stat().st_mode | 0o200)
        source_tree.chmod(0o755)
        shutil.rmtree(source_tree)
        legacy = self.root / "legacy-source"
        shutil.copytree(self.code, legacy)
        self.call(
            "finalize-batch",
            "--batch-id",
            "B1",
            "--expected",
            "R1:Fix1",
            "--candidate-strategy",
            "direct",
        )
        blocked = self.call(
            "sync-final-candidate",
            "--batch-id",
            "B1",
            "--candidate-strategy",
            "direct",
            "--candidate-dir",
            str(candidate),
            "--review-status",
            str(candidate / "control" / "review-status.json"),
            "--source-payload-dir",
            str(legacy),
            expected=2,
        )
        self.assertIn("does not match candidate source manifest", blocked["error"])


if __name__ == "__main__":
    unittest.main()
