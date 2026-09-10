#!/usr/bin/env python3
"""Deterministic orchestration for user-test R Fix review batches.

The tool keeps product code and review candidates separate.  It records
machine-readable state, hashes every relevant file, and refuses to restore or
merge when an unowned change is present.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Set, Tuple


SCHEMA_VERSION = 1
BATCH_RE = re.compile(r"^B[0-9]+$")
R_RE = re.compile(r"^R[0-9]+$")
FIX_RE = re.compile(r"^Fix[0-9]+$")
REVIEW_RE = re.compile(r"^(?:Review[0-9]+|B[0-9]+-Merge-Review[0-9]+)$")
R_ONLY_RE = re.compile(r"^(R[0-9]+)-(Fix[0-9]+)-only$")


class WorkflowError(RuntimeError):
    """A recoverable workflow gate failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def path_string(path: Path) -> str:
    return str(path.resolve())


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def require_within(path: Path, root: Path, label: str) -> Path:
    resolved = path.resolve()
    if not is_within(resolved, root):
        raise WorkflowError(f"{label} must be inside {root}: {path}")
    return resolved


def require_id(value: str, pattern: re.Pattern[str], label: str) -> str:
    if not pattern.fullmatch(value):
        raise WorkflowError(f"invalid {label}: {value}")
    return value


def ensure_directory(path: Path, label: str) -> Path:
    resolved = path.resolve()
    if resolved.exists() and not resolved.is_dir():
        raise WorkflowError(f"{label} is not a directory: {resolved}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def read_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    except FileNotFoundError as exc:
        raise WorkflowError(f"missing JSON file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkflowError(f"invalid JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise WorkflowError(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="",
            dir=str(path.parent),
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def reject_symlinks(root: Path) -> None:
    if root.is_symlink():
        raise WorkflowError(f"symlink root is not allowed: {root}")
    if not root.exists():
        raise WorkflowError(f"missing directory: {root}")
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in directories + files:
            item = current_path / name
            if item.is_symlink():
                raise WorkflowError(f"symlink is not allowed: {item}")


def copy_tree(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if not source.is_dir():
        raise WorkflowError(f"source directory does not exist: {source}")
    if destination.exists():
        raise WorkflowError(f"refusing to overwrite existing directory: {destination}")
    reject_symlinks(source)
    destination.mkdir(parents=True, exist_ok=False)
    for current, directories, files in os.walk(source, followlinks=False):
        current_path = Path(current)
        relative = current_path.relative_to(source)
        target_dir = destination / relative
        target_dir.mkdir(parents=True, exist_ok=True)
        for name in directories:
            (target_dir / name).mkdir(exist_ok=True)
        for name in files:
            shutil.copy2(current_path / name, target_dir / name)


def safe_manifest_path(relative: str) -> Path:
    """Return a safe relative path from a manifest record."""
    value = str(relative).replace("\\", "/")
    parts = [part for part in value.split("/") if part]
    if not parts or any(part in {".", ".."} for part in parts):
        raise WorkflowError(f"invalid manifest path: {relative}")
    return Path(*parts)


def copy_manifest_tree(
    source_root: Path,
    manifest: Mapping[str, Mapping[str, Any]],
    destination: Path,
) -> None:
    """Copy only files represented by a source manifest."""
    source_root = source_root.resolve()
    destination = destination.resolve()
    if not source_root.is_dir():
        raise WorkflowError(f"source directory does not exist: {source_root}")
    if destination.exists():
        raise WorkflowError(f"refusing to overwrite existing directory: {destination}")
    destination.mkdir(parents=True, exist_ok=False)
    for relative, recorded in sorted(manifest.items()):
        relative_path = safe_manifest_path(relative)
        source = (source_root / relative_path).resolve()
        if not is_within(source, source_root) or not source.is_file():
            raise WorkflowError(f"source manifest file is missing: {source}")
        cursor = source_root
        for part in relative_path.parts[:-1]:
            cursor = cursor / part
            if cursor.is_symlink():
                raise WorkflowError(f"symlink is not allowed: {cursor}")
        actual = file_record(source)
        if (
            actual.get("sha256") != recorded.get("sha256")
            or actual.get("size") != recorded.get("size")
        ):
            raise WorkflowError(f"source manifest file changed before copy: {relative}")
        target = destination / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if recorded.get("mode") is not None:
            target.chmod((target.stat().st_mode & ~0o777) | int(recorded["mode"]))


def make_tree_readonly(root: Path) -> None:
    """Make a completed source snapshot non-writable after all records are written."""
    root = root.resolve()
    if not root.is_dir():
        raise WorkflowError(f"missing snapshot directory: {root}")
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in directories + files:
            item = current_path / name
            if item.is_symlink():
                raise WorkflowError(f"symlink is not allowed: {item}")
            mode = item.stat().st_mode
            item.chmod(mode & ~0o222)
        mode = current_path.stat().st_mode
        current_path.chmod(mode & ~0o222)


def make_tree_writable(root: Path) -> None:
    """Restore owner write permission for controlled cleanup of failed snapshots."""
    root = root.resolve()
    if not root.exists():
        return
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in directories + files:
            item = current_path / name
            if item.is_symlink():
                continue
            item.chmod(item.stat().st_mode | 0o200)
        current_path.chmod(current_path.stat().st_mode | 0o200)


def remove_tree(path: Path) -> None:
    """Remove only a tool-owned temporary tree, including Windows read-only files."""
    if path.exists():
        make_tree_writable(path)
        shutil.rmtree(path, ignore_errors=False)


def write_candidate_source_artifacts(
    control_root: Path,
    source_root: Path,
    source_manifest: Mapping[str, Mapping[str, Any]],
    baseline_manifest: Mapping[str, Mapping[str, Any]],
    identity: Mapping[str, Any],
) -> Dict[str, Any]:
    """Persist an auditable source tree and the exact approved source diff."""
    source_manifest_value = dict(sorted(source_manifest.items()))
    baseline_manifest_value = dict(sorted(baseline_manifest.items()))
    changed = changed_entries(baseline_manifest_value, source_manifest_value)
    source_manifest_path = control_root / "candidate-source-manifest.json"
    approved_diff_path = control_root / "approved-source-diff.json"
    source_tree = control_root / "source-tree"
    write_json(source_manifest_path, manifest_payload(source_manifest_value))
    copy_manifest_tree(source_root, source_manifest_value, source_tree)
    if tree_manifest(source_tree) != source_manifest_value:
        raise WorkflowError("copied source tree does not match candidate source manifest")
    diff_payload = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "approved-source-diff",
        **dict(identity),
        "baselineManifest": manifest_payload(baseline_manifest_value),
        "candidateManifest": manifest_payload(source_manifest_value),
        "candidateSourceManifestPath": path_string(source_manifest_path),
        "candidateSourceManifestSha256": sha256_file(source_manifest_path),
        "candidateSourceTreeFingerprint": manifest_fingerprint(source_manifest_value),
        "changed": [
            {"path": path, "record": changed[path]}
            for path in sorted(changed)
        ],
        "approvedDiffFingerprint": approved_diff_fingerprint(changed),
    }
    write_json(approved_diff_path, diff_payload)
    make_tree_readonly(source_tree)
    return {
        "sourceTreePath": path_string(source_tree),
        "sourceManifestPath": path_string(source_manifest_path),
        "sourceManifestSha256": sha256_file(source_manifest_path),
        "sourceTreeFingerprint": manifest_fingerprint(source_manifest_value),
        "approvedSourceDiffPath": path_string(approved_diff_path),
        "approvedSourceDiffSha256": sha256_file(approved_diff_path),
        "approvedDiffFingerprint": diff_payload["approvedDiffFingerprint"],
        "candidateChangedFiles": sorted(changed),
    }


def file_record(path: Path) -> Dict[str, Any]:
    if path.is_symlink():
        raise WorkflowError(f"symlink is not allowed: {path}")
    if not path.is_file():
        raise WorkflowError(f"expected a file: {path}")
    stat = path.stat()
    return {
        "sha256": sha256_file(path),
        "size": stat.st_size,
        "mode": stat.st_mode & 0o777,
    }


def tree_manifest(root: Path, skip_names: Optional[Set[str]] = None) -> Dict[str, Dict[str, Any]]:
    root = root.resolve()
    if not root.is_dir():
        raise WorkflowError(f"missing directory: {root}")
    skip_names = skip_names or set()
    result: Dict[str, Dict[str, Any]] = {}
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        directories[:] = [name for name in directories if name not in skip_names]
        files[:] = [name for name in files if name not in skip_names]
        for name in directories + files:
            item = current_path / name
            if item.is_symlink():
                raise WorkflowError(f"symlink is not allowed: {item}")
        for name in files:
            item = current_path / name
            relative = item.relative_to(root).as_posix()
            result[relative] = file_record(item)
    return dict(sorted(result.items()))


def manifest_payload(manifest: Mapping[str, Mapping[str, Any]]) -> Dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "files": [
            {"path": path, **dict(manifest[path])}
            for path in sorted(manifest)
        ],
    }


def manifest_fingerprint(manifest: Mapping[str, Mapping[str, Any]]) -> str:
    return sha256_bytes(canonical_json(manifest_payload(manifest)))


def manifest_content_equal(
    left: Mapping[str, Mapping[str, Any]],
    right: Mapping[str, Mapping[str, Any]],
) -> bool:
    """Compare source content while allowing immutable copies to change mode bits."""
    if set(left) != set(right):
        return False
    return all(
        left[path].get("sha256") == right[path].get("sha256")
        and left[path].get("size") == right[path].get("size")
        for path in left
    )


def manifest_from_payload(value: Mapping[str, Any]) -> Dict[str, Dict[str, Any]]:
    files = value.get("files")
    if not isinstance(files, list):
        raise WorkflowError("manifest has no files list")
    result: Dict[str, Dict[str, Any]] = {}
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise WorkflowError("manifest contains an invalid file record")
        path = item["path"].replace("\\", "/")
        if path in result:
            raise WorkflowError(f"manifest contains duplicate path: {path}")
        result[path] = {
            "sha256": item.get("sha256"),
            "size": item.get("size"),
            "mode": item.get("mode"),
        }
    return dict(sorted(result.items()))


def changed_paths(
    before: Mapping[str, Mapping[str, Any]],
    after: Mapping[str, Mapping[str, Any]],
) -> List[str]:
    paths = sorted(set(before) | set(after))
    return [path for path in paths if before.get(path) != after.get(path)]


def git_run(
    git_root: Path,
    arguments: Sequence[str],
    binary: bool = False,
    environment: Optional[Mapping[str, str]] = None,
) -> Any:
    command = ["git", "-C", str(git_root), *arguments]
    try:
        process_environment = None
        if environment is not None:
            process_environment = os.environ.copy()
            process_environment.update(environment)
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
            env=process_environment,
        )
    except FileNotFoundError as exc:
        raise WorkflowError("git executable is not available") from exc
    except subprocess.CalledProcessError as exc:
        error = exc.stderr.decode("utf-8", "replace").strip()
        raise WorkflowError(f"git command failed: {' '.join(command)}: {error}") from exc
    if binary:
        return completed.stdout
    return completed.stdout.decode("utf-8", "replace")


def git_root_for(path: Path) -> Path:
    path = path.resolve()
    if not path.exists():
        raise WorkflowError(f"code root does not exist: {path}")
    value = git_run(path, ["rev-parse", "--show-toplevel"]).strip()
    if not value:
        raise WorkflowError(f"not a git worktree: {path}")
    return Path(value).resolve()


def git_head(path: Path) -> str:
    return git_run(git_root_for(path), ["rev-parse", "HEAD"]).strip()


def git_status(path: Path) -> str:
    root = git_root_for(path)
    relative = path.resolve().relative_to(root).as_posix()
    arguments = ["status", "--porcelain=v1", "--untracked-files=all"]
    if relative != ".":
        arguments.extend(["--", relative])
    return git_run(root, arguments).rstrip("\r\n")


def git_index_path(path: Path) -> Path:
    root = git_root_for(path)
    value = git_run(root, ["rev-parse", "--git-path", "index"]).strip()
    index = Path(value)
    if not index.is_absolute():
        index = root / index
    return index.resolve()


def git_files(path: Path) -> List[Path]:
    path = path.resolve()
    root = git_root_for(path)
    relative = path.relative_to(root).as_posix()
    arguments = ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", relative]
    raw = git_run(root, arguments, binary=True)
    result: List[Path] = []
    for item in raw.split(b"\0"):
        if not item:
            continue
        relative_item = item.decode("utf-8", "surrogateescape").replace("\\", "/")
        absolute = (root / Path(relative_item)).resolve()
        if not is_within(absolute, path):
            continue
        if absolute.is_file():
            result.append(absolute)
    return sorted(set(result))


def code_manifest(path: Path) -> Dict[str, Dict[str, Any]]:
    path = path.resolve()
    result: Dict[str, Dict[str, Any]] = {}
    for item in git_files(path):
        relative = item.relative_to(path).as_posix()
        result[relative] = file_record(item)
    return dict(sorted(result.items()))


def index_hash(index: Path) -> str:
    return sha256_file(index) if index.exists() else "missing"


def git_index_entries(path: Path, index: Optional[Path] = None) -> List[Dict[str, str]]:
    root = git_root_for(path)
    index_path = (index or git_index_path(path)).resolve()
    raw = git_run(
        root,
        ["ls-files", "--stage", "-z"],
        binary=True,
        environment={"GIT_INDEX_FILE": str(index_path)},
    )
    result: List[Dict[str, str]] = []
    for item in raw.split(b"\0"):
        if not item:
            continue
        header, relative_bytes = item.split(b"\t", 1)
        mode, stage, digest = header.decode("ascii").split()
        result.append(
            {
                "path": relative_bytes.decode("utf-8", "surrogateescape").replace("\\", "/"),
                "mode": mode,
                "stage": stage,
                "sha": digest,
            }
        )
    return sorted(result, key=lambda value: (value["path"], value["stage"]))


def index_entries_in_scope(
    entries: Iterable[Mapping[str, str]],
    git_root: Path,
    code_root: Path,
) -> List[Dict[str, str]]:
    code_relative = code_root.resolve().relative_to(git_root.resolve()).as_posix()
    prefix = "" if code_relative == "." else code_relative.rstrip("/") + "/"
    return [
        dict(entry)
        for entry in entries
        if entry["path"] == code_relative or entry["path"].startswith(prefix)
    ]


def index_entries_outside_scope(
    entries: Iterable[Mapping[str, str]],
    git_root: Path,
    code_root: Path,
) -> List[Dict[str, str]]:
    scoped = index_entries_in_scope(entries, git_root, code_root)
    scoped_keys = {(item["path"], item["stage"]) for item in scoped}
    return [
        dict(entry)
        for entry in entries
        if (entry["path"], entry["stage"]) not in scoped_keys
    ]


def workspace_fingerprint(
    head: str,
    status: str,
    index_digest: str,
    tree_digest: str,
) -> str:
    return sha256_bytes(
        canonical_json(
            {
                "head": head,
                "status": status,
                "indexSha256": index_digest,
                "treeFingerprint": tree_digest,
            }
        )
    )


def capture_code_state(path: Path) -> Dict[str, Any]:
    path = path.resolve()
    head = git_head(path)
    status = git_status(path)
    index = git_index_path(path)
    index_entries = git_index_entries(path, index)
    manifest = code_manifest(path)
    tree_digest = manifest_fingerprint(manifest)
    index_digest = index_hash(index)
    return {
        "head": head,
        "status": status,
        "indexPath": path_string(index),
        "indexSha256": index_digest,
        "indexEntries": index_entries,
        "manifest": manifest_payload(manifest),
        "treeFingerprint": tree_digest,
        "workspaceFingerprint": workspace_fingerprint(
            head,
            status,
            index_digest,
            tree_digest,
        ),
    }


def parse_manifest_record(value: Mapping[str, Any]) -> Dict[str, Dict[str, Any]]:
    if isinstance(value, Mapping) and "files" in value:
        return manifest_from_payload(value)
    raise WorkflowError("invalid manifest record")


def source_manifest(source: Path, code_root: Path) -> Dict[str, Dict[str, Any]]:
    source = source.resolve()
    if source == code_root.resolve():
        return code_manifest(source)
    return tree_manifest(
        source,
        skip_names={".git", "candidate-source.json", ".r-fix-source.json"},
    )


def launch_command_value(value: str) -> str:
    value = value or "app\\WorkBuddy.exe"
    value = value.replace("/", "\\")
    if any(char in value for char in '"&|<>^%\r\n'):
        raise WorkflowError(f"launch command contains shell metacharacters: {value}")
    candidate = Path(value)
    if candidate.is_absolute() or any(part in {".", ".."} for part in candidate.parts):
        raise WorkflowError(f"launch command must be a relative app path: {value}")
    if not value or candidate.name in {"", ".", ".."}:
        raise WorkflowError(f"launch command must name an app file: {value}")
    return value


def normalise_relative(value: str, root: Path, label: str) -> str:
    candidate = Path(value)
    if candidate.is_absolute():
        resolved = candidate.resolve()
        if not is_within(resolved, root):
            raise WorkflowError(f"{label} is outside {root}: {value}")
        value = resolved.relative_to(root.resolve()).as_posix()
    else:
        value = value.replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    parts = [part for part in value.split("/") if part]
    if not parts or any(part in {".", ".."} for part in parts):
        raise WorkflowError(f"invalid {label}: {value}")
    return "/".join(parts)


def parse_allowed(values: Iterable[str], root: Path, label: str) -> Set[str]:
    result: Set[str] = set()
    for value in values:
        if value.startswith("@"):
            file_path = Path(value[1:]).resolve()
            if not file_path.is_file():
                raise WorkflowError(f"missing {label} list: {file_path}")
            try:
                loaded = json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise WorkflowError(f"invalid {label} list: {file_path}") from exc
            if isinstance(loaded, dict):
                loaded = loaded.get("files")
            if not isinstance(loaded, list):
                raise WorkflowError(f"{label} list must be a JSON array: {file_path}")
            entries = [str(item["path"] if isinstance(item, dict) and "path" in item else item) for item in loaded]
        else:
            entries = [value]
        for entry in entries:
            result.add(normalise_relative(entry, root, label))
    return result


def changed_entries(
    before: Mapping[str, Mapping[str, Any]],
    after: Mapping[str, Mapping[str, Any]],
) -> Dict[str, Optional[Dict[str, Any]]]:
    result: Dict[str, Optional[Dict[str, Any]]] = {}
    for path in changed_paths(before, after):
        result[path] = dict(after[path]) if path in after else None
    return result


def approved_diff_fingerprint(
    changed: Mapping[str, Optional[Mapping[str, Any]]],
) -> str:
    payload = [
        {"path": path, "record": changed[path]}
        for path in sorted(changed)
    ]
    return sha256_bytes(canonical_json(payload))


@contextlib.contextmanager
def directory_lock(path: Path) -> Iterator[None]:
    path = path.resolve()
    try:
        path.mkdir(parents=True, exist_ok=False)
    except FileExistsError as exc:
        raise WorkflowError(f"workflow is already running: {path}") from exc
    try:
        yield
    finally:
        try:
            path.rmdir()
        except OSError:
            pass


def resolve_paths(args: argparse.Namespace) -> Tuple[Path, Path, Path, Path]:
    workspace = Path(args.workspace_root).resolve() if args.workspace_root else Path(__file__).resolve().parents[1]
    code_root = Path(args.code_root).resolve() if args.code_root else workspace / "workbuddy"
    review_root = Path(args.review_root).resolve() if args.review_root else Path(r"E:\workbuddy 复审")
    snapshot_root = Path(args.snapshot_root).resolve() if args.snapshot_root else Path(r"E:\workbuddy-snapshots")
    if not code_root.is_dir():
        raise WorkflowError(f"code root does not exist: {code_root}")
    ensure_directory(review_root, "review root")
    ensure_directory(snapshot_root, "snapshot root")
    if is_within(review_root, code_root) or is_within(snapshot_root, code_root):
        raise WorkflowError("review and snapshot roots must not be inside the product code root")
    if review_root == snapshot_root:
        raise WorkflowError("review root and snapshot root must be different directories")
    return workspace, code_root, review_root, snapshot_root


def batch_directory(review_root: Path, batch_id: str) -> Path:
    require_id(batch_id, BATCH_RE, "batch id")
    return review_root / batch_id


def batch_control(review_root: Path, batch_id: str) -> Path:
    return batch_directory(review_root, batch_id) / "control"


def begin_path(review_root: Path, batch_id: str, r_id: str, fix_id: str) -> Path:
    return batch_control(review_root, batch_id) / f"{r_id}-{fix_id}" / "begin-fix.json"


def candidate_directory(review_root: Path, batch_id: str, r_id: str, fix_id: str) -> Path:
    require_id(r_id, R_RE, "R id")
    require_id(fix_id, FIX_RE, "Fix id")
    return batch_directory(review_root, batch_id) / f"{r_id}-{fix_id}-only"


def development_pointer_path(review_root: Path) -> Path:
    return review_root / "current-development-pointer.json"


def source_sync_result_path(review_root: Path, batch_id: str) -> Path:
    return batch_control(review_root, batch_id) / "source-sync-result.json"


def source_sync_snapshot_directory(
    snapshot_root: Path,
    batch_id: str,
    candidate_dir: Path,
) -> Path:
    candidate_name = candidate_dir.name
    if candidate_name != "merge" and not R_ONLY_RE.fullmatch(candidate_name):
        raise WorkflowError(f"invalid final candidate directory name: {candidate_name}")
    return snapshot_root / f"{batch_id}-{candidate_name}-source-sync"


def baseline_snapshot_directory(snapshot_root: Path, batch_id: str, r_id: str, fix_id: str) -> Path:
    require_id(batch_id, BATCH_RE, "batch id")
    require_id(r_id, R_RE, "R id")
    require_id(fix_id, FIX_RE, "Fix id")
    return snapshot_root / f"{batch_id}-{r_id}-{fix_id}-begin"


def load_begin(review_root: Path, batch_id: str, r_id: str, fix_id: str) -> Dict[str, Any]:
    path = begin_path(review_root, batch_id, r_id, fix_id)
    return read_json(path)


def validate_begin_identity(
    begin: Mapping[str, Any],
    code_root: Path,
    snapshot_root: Path,
    batch_id: str,
    r_id: str,
    fix_id: str,
) -> None:
    expected_snapshot = baseline_snapshot_directory(snapshot_root, batch_id, r_id, fix_id)
    if begin.get("kind") != "r-fix-begin":
        raise WorkflowError("begin-fix state has an invalid kind")
    if begin.get("batchId") != batch_id or begin.get("rId") != r_id or begin.get("fixId") != fix_id:
        raise WorkflowError("begin-fix state identity does not match the requested R/Fix")
    if begin.get("status") not in {"begun", "completed"}:
        raise WorkflowError(f"begin-fix state is not actionable: {begin.get('status')}")
    if begin.get("codeRoot") != path_string(code_root):
        raise WorkflowError("begin-fix state belongs to a different development directory")
    if begin.get("gitRoot") != path_string(git_root_for(code_root)):
        raise WorkflowError("begin-fix state belongs to a different Git worktree")
    if begin.get("snapshotRoot") != path_string(expected_snapshot):
        raise WorkflowError("begin-fix state belongs to a different snapshot directory")


def validate_development_pointer(
    review_root: Path,
    code_root: Path,
    current: Mapping[str, Any],
) -> Optional[Dict[str, Any]]:
    """Require a registered/synced development baseline when one exists."""
    path = development_pointer_path(review_root)
    if not path.is_file():
        return None
    pointer = read_json(path)
    if pointer.get("codeRoot") != path_string(code_root):
        raise WorkflowError("current development pointer belongs to a different code root")
    if pointer.get("sourceSyncStatus") not in {"verified", "registered"}:
        raise WorkflowError(
            "current development pointer is not verified; register or sync the final candidate first"
        )
    if pointer.get("sourceSyncStatus") == "registered" and pointer.get("registrationKind") not in {
        "c0",
        "history-migration",
    }:
        raise WorkflowError("registered development pointer has an invalid registration kind")
    expected = pointer.get("workspaceFingerprint")
    if not isinstance(expected, str) or not expected:
        raise WorkflowError("current development pointer has no workspace fingerprint")
    if current.get("workspaceFingerprint") != expected:
        raise WorkflowError(
            "development worktree does not match current-development-pointer.json"
        )
    return pointer


def register_development_baseline(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, _ = resolve_paths(args)
    pointer_path = development_pointer_path(review_root)
    current = capture_code_state(code_root)
    with directory_lock(review_root / ".development-pointer.lock"):
        if pointer_path.is_file():
            existing = read_json(pointer_path)
            if (
                existing.get("sourceSyncStatus") == "registered"
                and existing.get("registrationKind") == args.registration_kind
                and existing.get("workspaceFingerprint") == current["workspaceFingerprint"]
            ):
                return {
                    "ok": True,
                    "command": "register-development-baseline",
                    "idempotent": True,
                    "pointer": existing,
                }
            raise WorkflowError(
                "current-development-pointer.json already exists; do not overwrite the current development baseline"
            )
        pointer = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "current-development-pointer",
            "sourceSyncStatus": "registered",
            "registrationKind": args.registration_kind,
            "registrationReason": args.reason or "explicit development baseline registration",
            "codeRoot": path_string(code_root),
            "gitRoot": path_string(git_root_for(code_root)),
            "head": current["head"],
            "status": current["status"],
            "indexSha256": current["indexSha256"],
            "treeFingerprint": current["treeFingerprint"],
            "workspaceFingerprint": current["workspaceFingerprint"],
            "registeredAt": utc_now(),
            "registeredBy": "workflow-tool",
            "nextAction": "begin-fix-or-create-c0",
        }
        write_json(pointer_path, pointer)
        return {
            "ok": True,
            "command": "register-development-baseline",
            "idempotent": False,
            "pointer": pointer,
        }


def active_begin_states(
    control_root: Path,
    excluded: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    active: List[Dict[str, Any]] = []
    if not control_root.is_dir():
        return active
    excluded = excluded.resolve() if excluded else None
    for state_path in control_root.glob("*/begin-fix.json"):
        if not state_path.is_file():
            continue
        if excluded and state_path.resolve() == excluded:
            continue
        state = read_json(state_path)
        if state.get("status") == "begun":
            active.append(state)
    return active


def begin_fix(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    require_id(args.r_id, R_RE, "R id")
    require_id(args.fix_id, FIX_RE, "Fix id")
    state_path = begin_path(review_root, args.batch_id, args.r_id, args.fix_id)
    snapshot_dir = baseline_snapshot_directory(snapshot_root, args.batch_id, args.r_id, args.fix_id)
    batch_control_dir = batch_control(review_root, args.batch_id)
    control_dir = state_path.parent

    with directory_lock(batch_control_dir / ".lock"):
        # Every invocation must prove that the development worktree still
        # matches the registered/synchronized pointer.  This validation must
        # happen before the idempotent existing-state branches so a stale or
        # tampered pointer cannot be silently bypassed by re-running begin-fix.
        current = capture_code_state(code_root)
        pointer = validate_development_pointer(review_root, code_root, current)
        if pointer is None:
            raise WorkflowError(
                "current-development-pointer.json is missing; explicitly register a C0 or history-migration baseline first"
            )
        control_dir.mkdir(parents=True, exist_ok=True)
        if state_path.exists():
            existing = read_json(state_path)
            if existing.get("status") == "completed":
                return {
                    "ok": True,
                    "command": "begin-fix",
                    "idempotent": True,
                    "state": existing,
                }
            if existing.get("baselineWorkspaceFingerprint") != current["workspaceFingerprint"]:
                raise WorkflowError(
                    "begin-fix already exists but the current worktree no longer matches its baseline"
                )
            return {
                "ok": True,
                "command": "begin-fix",
                "idempotent": True,
                "state": existing,
            }

        active = active_begin_states(batch_control_dir)
        if active:
            occupied = ", ".join(
                f"{item.get('rId')}:{item.get('fixId')}"
                for item in active
            )
            raise WorkflowError(
                "another R Fix already owns the development worktree: " + occupied
            )
        if snapshot_dir.exists():
            raise WorkflowError(f"snapshot directory already exists without begin state: {snapshot_dir}")
        snapshot_dir.mkdir(parents=True, exist_ok=False)
        state = current
        for relative in sorted(state["manifest"]["files"], key=lambda item: item["path"]):
            source = code_root / Path(relative["path"])
            target = snapshot_dir / Path(relative["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        index_path = Path(state["indexPath"])
        if index_path.exists():
            shutil.copy2(index_path, snapshot_dir / "git-index")
        write_json(snapshot_dir / "manifest.json", state["manifest"])
        write_text(snapshot_dir / "git-status.txt", state["status"] + ("\n" if state["status"] else ""))
        write_json(
            snapshot_dir / "snapshot-record.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "kind": "r-fix-baseline-snapshot",
                "batchId": args.batch_id,
                "rId": args.r_id,
                "fixId": args.fix_id,
                "createdAt": utc_now(),
                "codeRoot": path_string(code_root),
                "gitRoot": path_string(git_root_for(code_root)),
                "head": state["head"],
                "indexSha256": state["indexSha256"],
                "indexEntries": state["indexEntries"],
                "treeFingerprint": state["treeFingerprint"],
                "workspaceFingerprint": state["workspaceFingerprint"],
                "developmentPointerPath": path_string(development_pointer_path(review_root)),
                "developmentPointerWorkspaceFingerprint": pointer["workspaceFingerprint"],
                "developmentPointerStatus": pointer["sourceSyncStatus"],
                "fileCount": len(state["manifest"]["files"]),
                "scope": "tracked-and-non-ignored-files-under-code-root",
            },
        )
        created = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "r-fix-begin",
            "status": "begun",
            "batchId": args.batch_id,
            "rId": args.r_id,
            "fixId": args.fix_id,
            "createdAt": utc_now(),
            "codeRoot": path_string(code_root),
            "gitRoot": path_string(git_root_for(code_root)),
            "snapshotRoot": path_string(snapshot_dir),
            "baselineHead": state["head"],
            "baselineStatus": state["status"],
            "baselineIndexPath": state["indexPath"],
            "baselineIndexSha256": state["indexSha256"],
            "baselineIndexEntries": state["indexEntries"],
            "baselineTreeFingerprint": state["treeFingerprint"],
            "baselineWorkspaceFingerprint": state["workspaceFingerprint"],
            "baselineManifest": state["manifest"],
            "developmentPointerPath": path_string(development_pointer_path(review_root)),
            "developmentPointerWorkspaceFingerprint": pointer["workspaceFingerprint"],
            "developmentPointerStatus": pointer["sourceSyncStatus"],
            "scope": "tracked-and-non-ignored-files-under-code-root",
            "nextAction": "complete-fix",
        }
        write_json(state_path, created)
        return {
            "ok": True,
            "command": "begin-fix",
            "idempotent": False,
            "state": created,
        }


def source_base_commit(source: Path, code_root: Path, supplied: str) -> Optional[str]:
    if supplied:
        return supplied.strip()
    try:
        return git_head(source)
    except WorkflowError:
        metadata_candidates = [source / "candidate-source.json", source / ".r-fix-source.json"]
        for candidate in metadata_candidates:
            if candidate.is_file():
                value = read_json(candidate).get("baseCommit")
                if isinstance(value, str) and value:
                    return value
        return None


def build_record(app_root: Path, control_root: Path) -> Dict[str, Any]:
    manifest = tree_manifest(app_root)
    payload = manifest_payload(manifest)
    manifest_path = control_root / "build-manifest.json"
    write_json(manifest_path, payload)
    return {
        "appRoot": path_string(app_root),
        "manifestPath": path_string(manifest_path),
        "manifestSha256": sha256_file(manifest_path),
        "treeFingerprint": manifest_fingerprint(manifest),
        "fileCount": len(manifest),
        "totalBytes": sum(int(item["size"]) for item in manifest.values()),
    }


def update_review_meta(candidate_dir: Path, updates: Mapping[str, Any]) -> Dict[str, Any]:
    path = candidate_dir / "review-meta.json"
    meta = read_json(path)
    meta.update(updates)
    write_json(path, meta)
    return meta


def complete_fix(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    require_id(args.r_id, R_RE, "R id")
    require_id(args.fix_id, FIX_RE, "Fix id")
    build_dir = Path(args.build_dir).resolve()
    if not build_dir.is_dir():
        raise WorkflowError(f"build directory does not exist: {build_dir}")
    candidate_source = Path(args.candidate_source).resolve() if args.candidate_source else code_root
    if not candidate_source.is_dir():
        raise WorkflowError(f"candidate source directory does not exist: {candidate_source}")
    candidate_dir = candidate_directory(review_root, args.batch_id, args.r_id, args.fix_id)
    begin = load_begin(review_root, args.batch_id, args.r_id, args.fix_id)
    validate_begin_identity(
        begin,
        code_root,
        snapshot_root,
        args.batch_id,
        args.r_id,
        args.fix_id,
    )
    active = active_begin_states(
        batch_control(review_root, args.batch_id),
        begin_path(review_root, args.batch_id, args.r_id, args.fix_id),
    )
    if active:
        occupied = ", ".join(
            f"{item.get('rId')}:{item.get('fixId')}"
            for item in active
        )
        raise WorkflowError(
            "another R Fix already owns the development worktree: " + occupied
        )

    if candidate_dir.exists():
        meta_path = candidate_dir / "review-meta.json"
        if meta_path.is_file():
            existing = read_json(meta_path)
            if existing.get("status") == "completed" and existing.get("restoreStatus") == "verified":
                return {
                    "ok": True,
                    "command": "complete-fix",
                    "idempotent": True,
                    "candidate": existing,
                }
            if existing.get("status") == "completed":
                raise WorkflowError(
                    "candidate directory exists but its development-worktree restore is not verified; "
                    "stop and investigate before retrying: " + str(candidate_dir)
                )
        raise WorkflowError(f"candidate directory already exists and is not a completed identical run: {candidate_dir}")

    current_state = capture_code_state(code_root)
    if current_state["head"] != begin.get("baselineHead"):
        raise WorkflowError(
            f"worktree HEAD changed after begin-fix: {current_state['head']} != {begin.get('baselineHead')}"
        )
    baseline_index_entries = begin.get("baselineIndexEntries")
    if isinstance(baseline_index_entries, list):
        git_root = git_root_for(code_root)
        baseline_outside = index_entries_outside_scope(
            baseline_index_entries,
            git_root,
            code_root,
        )
        current_outside = index_entries_outside_scope(
            current_state["indexEntries"],
            git_root,
            code_root,
        )
        if baseline_outside != current_outside:
            raise WorkflowError(
                "complete-fix refused because Git index entries outside the development area changed"
            )
    baseline_manifest = parse_manifest_record(begin["baselineManifest"])
    current_manifest = parse_manifest_record(current_state["manifest"])
    worktree_changed = changed_entries(baseline_manifest, current_manifest)
    source_manifest_value = source_manifest(candidate_source, code_root)
    source_changed = changed_entries(baseline_manifest, source_manifest_value)
    source_base = source_base_commit(
        candidate_source,
        code_root,
        getattr(args, "candidate_base_commit", "") or "",
    )
    if source_base != begin.get("baselineHead"):
        raise WorkflowError(
            f"candidate source base commit does not match baseline: {source_base} != {begin.get('baselineHead')}"
        )

    allowed_source = parse_allowed(args.allowed_source_file or [], code_root, "allowed source file")
    allowed_worktree_values = args.allowed_worktree_file or []
    allowed_worktree = parse_allowed(
        allowed_worktree_values if allowed_worktree_values else list(allowed_source),
        code_root,
        "allowed worktree file",
    )
    unknown_source = sorted(set(source_changed) - allowed_source)
    unknown_worktree = sorted(set(worktree_changed) - allowed_worktree)
    if unknown_source or unknown_worktree:
        parts = []
        if unknown_source:
            parts.append("candidate source: " + ", ".join(unknown_source))
        if unknown_worktree:
            parts.append("development worktree: " + ", ".join(unknown_worktree))
        raise WorkflowError("unowned Fix changes detected; no candidate was created or restored: " + "; ".join(parts))

    if not source_changed:
        raise WorkflowError("complete-fix found no approved change in the candidate source")

    candidate_control = candidate_dir / "control"
    candidate_evidence = candidate_dir / "evidence"
    candidate_userdata = candidate_dir / "userData"
    candidate_dir.mkdir(parents=True, exist_ok=False)
    candidate_control.mkdir()
    candidate_evidence.mkdir()
    candidate_userdata.mkdir()
    try:
        copy_tree(build_dir, candidate_dir / "app")
        source_artifacts = write_candidate_source_artifacts(
            candidate_control,
            candidate_source,
            source_manifest_value,
            baseline_manifest,
            {
                "batchId": args.batch_id,
                "rId": args.r_id,
                "fixId": args.fix_id,
                "candidateType": "r-only",
                "baselineHead": begin["baselineHead"],
                "baselineIndexEntries": begin.get("baselineIndexEntries", []),
                "candidateIndexEntries": current_state.get("indexEntries", []),
                "syncBaseIndexEntries": begin.get("baselineIndexEntries", []),
            },
        )
        post_fix_state = current_state
        write_json(candidate_control / "post-fix-manifest.json", post_fix_state["manifest"])
        write_text(
            candidate_control / "post-fix-git-status.txt",
            post_fix_state["status"] + ("\n" if post_fix_state["status"] else ""),
        )
        index_path = Path(post_fix_state["indexPath"])
        if index_path.exists():
            shutil.copy2(index_path, candidate_control / "post-fix-git-index")
        build = build_record(candidate_dir / "app", candidate_control)
        launch_command = launch_command_value(args.launch_command)
        write_text(
            candidate_dir / f"启动复审-{args.r_id}-{args.fix_id}.bat",
            "\r\n".join(
                [
                    "@echo off",
                    "setlocal",
                    'set "ROOT=%~dp0"',
                    'set "USER_DATA=%ROOT%userData"',
                    'if not exist "%USER_DATA%" mkdir "%USER_DATA%"',
                    f'echo Launch command: {launch_command}',
                    f'if exist "%ROOT%{launch_command}" start "" "%ROOT%{launch_command}" --user-data-dir="%USER_DATA%"',
                    f'if not exist "%ROOT%{launch_command}" echo Missing launch target: %ROOT%{launch_command}',
                    "endlocal",
                    "",
                ]
            ),
        )
        candidate_meta = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "r-fix-review-candidate",
            "status": "completed",
            "candidateType": "r-only",
            "batchId": args.batch_id,
            "rId": args.r_id,
            "fixId": args.fix_id,
            "createdAt": utc_now(),
            "codeRoot": path_string(code_root),
            "candidateDir": path_string(candidate_dir),
            "appDir": path_string(candidate_dir / "app"),
            "userDataDir": path_string(candidate_userdata),
            "evidenceDir": path_string(candidate_evidence),
            "reviewLauncher": path_string(next(candidate_dir.glob("启动复审-*.bat"))),
            "launchCommand": launch_command,
            "candidateSource": path_string(candidate_source),
            "candidateBaseCommit": source_base,
            "baselineHead": begin["baselineHead"],
            "baselineTreeFingerprint": begin["baselineTreeFingerprint"],
            "baselineWorkspaceFingerprint": begin["baselineWorkspaceFingerprint"],
            "preFixStatus": begin["baselineStatus"],
            "postFixWorkspaceFingerprint": post_fix_state["workspaceFingerprint"],
            "postFixTreeFingerprint": post_fix_state["treeFingerprint"],
            "worktreeChangedFiles": sorted(worktree_changed),
            "candidateChangedFiles": sorted(source_changed),
            "allowedSourceFiles": sorted(allowed_source),
            "allowedWorktreeFiles": sorted(allowed_worktree),
            "approvedDiffFingerprint": approved_diff_fingerprint(source_changed),
            "candidateSourceManifestPath": source_artifacts["sourceManifestPath"],
            "candidateSourceManifestSha256": source_artifacts["sourceManifestSha256"],
            "candidateSourceTreePath": source_artifacts["sourceTreePath"],
            "candidateSourceTreeFingerprint": source_artifacts["sourceTreeFingerprint"],
            "approvedSourceDiffPath": source_artifacts["approvedSourceDiffPath"],
            "approvedSourceDiffSha256": source_artifacts["approvedSourceDiffSha256"],
            "approvedDiffFingerprint": source_artifacts["approvedDiffFingerprint"],
            "build": build,
            "reviewStatus": "not-reviewed",
            "restoreStatus": "pending",
            "scope": "only-approved-R-fix",
            "nextAction": "restore-development-worktree-then-05",
        }
        write_json(candidate_dir / "review-meta.json", candidate_meta)
        write_json(
            candidate_control / "fix-complete.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "kind": "r-fix-complete",
                "createdAt": utc_now(),
                "candidate": path_string(candidate_dir),
                "batchId": args.batch_id,
                "rId": args.r_id,
                "fixId": args.fix_id,
                "postFixWorkspaceFingerprint": post_fix_state["workspaceFingerprint"],
                "nextAction": "restore-development-worktree",
            },
        )
    except Exception:
        remove_tree(candidate_dir)
        raise

    try:
        restore_result = restore_baseline(code_root, begin, allowed_worktree)
    except WorkflowError as exc:
        restore_failure = {
            "schemaVersion": SCHEMA_VERSION,
            "restoreStatus": "failed",
            "failedAt": utc_now(),
            "error": str(exc),
            "postFixWorkspaceFingerprint": current_state["workspaceFingerprint"],
            "postFixTreeFingerprint": current_state["treeFingerprint"],
            "candidate": path_string(candidate_dir),
        }
        write_json(candidate_control / "restore-result.json", restore_failure)
        update_review_meta(
            candidate_dir,
            {
                "restoreStatus": "failed",
                "restoreError": str(exc),
                "restoreEvidencePath": path_string(candidate_control / "restore-result.json"),
                "nextAction": "stop-and-investigate-worktree-ownership",
            },
        )
        raise
    begin_state_path = begin_path(review_root, args.batch_id, args.r_id, args.fix_id)
    begin["status"] = "completed"
    begin["completedAt"] = utc_now()
    begin["allowedWorktreeFiles"] = sorted(allowed_worktree)
    begin["candidateDir"] = path_string(candidate_dir)
    begin["nextAction"] = "05-r-only-review"
    write_json(begin_state_path, begin)
    meta = update_review_meta(
        candidate_dir,
        {
            "restoreStatus": restore_result["restoreStatus"],
            "restoredWorkspaceFingerprint": restore_result["restoredWorkspaceFingerprint"],
            "restoredTreeFingerprint": restore_result["restoredTreeFingerprint"],
            "restoredStatus": restore_result["restoredStatus"],
            "restoreEvidencePath": path_string(candidate_control / "restore-result.json"),
            "nextAction": "05-r-only-review",
        },
    )
    write_json(candidate_control / "restore-result.json", restore_result)
    return {
        "ok": True,
        "command": "complete-fix",
        "idempotent": False,
        "candidate": meta,
        "restore": restore_result,
    }


def restore_baseline(
    code_root: Path,
    begin: Mapping[str, Any],
    allowed_worktree: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    baseline_manifest = parse_manifest_record(begin["baselineManifest"])
    before = capture_code_state(code_root)
    current_manifest = parse_manifest_record(before["manifest"])
    introduced = sorted(set(current_manifest) - set(baseline_manifest))
    changed = changed_entries(baseline_manifest, current_manifest)
    baseline_index_entries = begin.get("baselineIndexEntries")
    if isinstance(baseline_index_entries, list):
        git_root = git_root_for(code_root)
        baseline_outside = index_entries_outside_scope(
            baseline_index_entries,
            git_root,
            code_root,
        )
        current_outside = index_entries_outside_scope(
            before["indexEntries"],
            git_root,
            code_root,
        )
        if baseline_outside != current_outside:
            raise WorkflowError(
                "restore refused because Git index entries outside the development area changed"
            )
    allowed = set(begin.get("allowedWorktreeFiles", [])) if allowed_worktree is None else set(allowed_worktree)
    unknown = sorted(set(changed) - allowed)
    if unknown:
        raise WorkflowError(
            "restore refused because unowned changes appeared after Fix: " + ", ".join(unknown)
        )
    snapshot_dir = Path(begin["snapshotRoot"]).resolve()
    if not snapshot_dir.is_dir():
        raise WorkflowError(f"baseline snapshot is missing: {snapshot_dir}")
    for relative in introduced:
        target = code_root / Path(relative)
        if target.is_symlink():
            raise WorkflowError(f"refusing to remove symlink during restore: {target}")
        if target.exists() and target.is_dir():
            raise WorkflowError(f"refusing to remove unexpected directory during restore: {target}")
    for relative in baseline_manifest:
        source = snapshot_dir / Path(relative)
        target = code_root / Path(relative)
        if not source.is_file():
            raise WorkflowError(f"baseline file is missing from snapshot: {source}")
        if target.is_symlink():
            raise WorkflowError(f"refusing to overwrite symlink during restore: {target}")
        if target.exists() and not target.is_file():
            raise WorkflowError(f"baseline target is not a file: {target}")
    index_target = git_index_path(code_root)
    index_source = snapshot_dir / "git-index"
    lock_target = Path(str(index_target) + ".lock")
    if lock_target.exists():
        raise WorkflowError(f"git index is locked: {lock_target}")

    for relative in introduced:
        target = code_root / Path(relative)
        if target.exists() or target.is_symlink():
            target.unlink()
    for relative, record in baseline_manifest.items():
        source = snapshot_dir / Path(relative)
        target = code_root / Path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if file_record(target) != record:
            raise WorkflowError(f"restored file hash mismatch: {target}")

    if index_source.exists():
        index_target.parent.mkdir(parents=True, exist_ok=True)
        temporary = index_target.with_name(index_target.name + ".r-fix-restore.tmp")
        shutil.copy2(index_source, temporary)
        os.replace(temporary, index_target)
    elif index_target.exists():
        index_target.unlink()

    after = capture_code_state(code_root)
    expected_status = str(begin.get("baselineStatus", ""))
    expected_workspace = str(begin.get("baselineWorkspaceFingerprint", ""))
    if after["workspaceFingerprint"] != expected_workspace:
        result = {
            "schemaVersion": SCHEMA_VERSION,
            "restoreStatus": "failed",
            "restoredWorkspaceFingerprint": after["workspaceFingerprint"],
            "restoredTreeFingerprint": after["treeFingerprint"],
            "restoredStatus": after["status"],
            "expectedWorkspaceFingerprint": expected_workspace,
            "expectedStatus": expected_status,
            "introducedFilesRemoved": introduced,
        }
        raise WorkflowError("worktree restore verification failed: " + json.dumps(result, ensure_ascii=False))
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "restoreStatus": "verified",
        "restoredAt": utc_now(),
        "restoredWorkspaceFingerprint": after["workspaceFingerprint"],
        "restoredTreeFingerprint": after["treeFingerprint"],
        "restoredStatus": after["status"],
        "expectedWorkspaceFingerprint": expected_workspace,
        "expectedStatus": expected_status,
        "introducedFilesRemoved": introduced,
        "scope": "tracked-and-non-ignored-files-under-code-root",
    }
    return result


def candidate_for_args(
    review_root: Path,
    batch_id: str,
    r_id: Optional[str],
    fix_id: Optional[str],
    candidate_kind: str,
) -> Path:
    if candidate_kind == "merge":
        return batch_directory(review_root, batch_id) / "merge"
    if not r_id or not fix_id:
        raise WorkflowError("R-only review status requires --r-id and --fix-id")
    return candidate_directory(review_root, batch_id, r_id, fix_id)


def review_status_path_for_write(candidate_dir: Path, review_id: str) -> Path:
    """Keep each terminal review status immutable while allowing later reviews."""
    control_dir = candidate_dir / "control"
    primary = control_dir / "review-status.json"
    named = control_dir / f"review-status-{review_id}.json"
    if named.is_file():
        return named
    if primary.is_file():
        existing = read_json(primary)
        if existing.get("reviewId") == review_id:
            return primary
        return named
    if any(control_dir.glob("review-status-*.json")):
        return named
    return primary


def latest_review_status(candidate_dir: Path) -> Tuple[Dict[str, Any], Path]:
    """Return the newest review record without treating the primary file as mutable."""
    control_dir = candidate_dir / "control"
    paths = []
    primary = control_dir / "review-status.json"
    if primary.is_file():
        paths.append(primary)
    paths.extend(sorted(control_dir.glob("review-status-*.json")))
    records = []
    seen_ids = set()
    for path in paths:
        status = read_json(path)
        review_id = str(status.get("reviewId", ""))
        if review_id in seen_ids:
            raise WorkflowError(f"duplicate review status record: {review_id}")
        seen_ids.add(review_id)
        match = re.search(r"Review([0-9]+)$", review_id)
        if not match:
            raise WorkflowError(f"invalid review id in status record: {path}")
        records.append((int(match.group(1)), path, status))
    if not records:
        raise WorkflowError(f"review status does not exist: {candidate_dir}")
    _, path, status = max(records, key=lambda item: item[0])
    return status, path


def candidate_baseline_manifest(
    review_root: Path,
    batch_id: str,
    candidate_dir: Path,
    meta: Mapping[str, Any],
) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, str]], str]:
    diff_path = candidate_dir / "control" / "approved-source-diff.json"
    if diff_path.is_file():
        diff = read_json(diff_path)
        baseline_value = diff.get("baselineManifest")
        if isinstance(baseline_value, dict):
            baseline = parse_manifest_record(baseline_value)
            index_entries = diff.get("baselineIndexEntries", [])
            if not isinstance(index_entries, list):
                raise WorkflowError(f"approved source diff has invalid baseline index entries: {diff_path}")
            head = str(diff.get("baselineHead") or meta.get("baselineHead") or meta.get("baseCommit") or "")
            if not head:
                raise WorkflowError(f"approved source diff has no baseline HEAD: {diff_path}")
            return baseline, [dict(item) for item in index_entries], head
    candidate_type = meta.get("candidateType")
    if candidate_type == "r-only":
        r_id = str(meta.get("rId") or "")
        fix_id = str(meta.get("fixId") or "")
        if not r_id or not fix_id:
            raise WorkflowError("R-only candidate has no R/Fix identity")
        begin = load_begin(review_root, batch_id, r_id, fix_id)
        return (
            parse_manifest_record(begin["baselineManifest"]),
            [dict(item) for item in begin.get("baselineIndexEntries", [])],
            str(begin.get("baselineHead") or ""),
        )
    if candidate_type == "merge":
        state = load_batch_state(review_root, batch_id)
        expected = state.get("expectedRFixes")
        if not isinstance(expected, list) or not expected:
            raise WorkflowError("merge batch has no expected R/Fix set")
        first = expected[0]
        begin = load_begin(
            review_root,
            batch_id,
            str(first.get("rId")),
            str(first.get("fixId")),
        )
        return (
            parse_manifest_record(begin["baselineManifest"]),
            [dict(item) for item in begin.get("baselineIndexEntries", [])],
            str(meta.get("baseCommit") or begin.get("baselineHead") or ""),
        )
    raise WorkflowError(f"unsupported candidate type: {candidate_type}")


def candidate_source_manifest(
    candidate_dir: Path,
    meta: Mapping[str, Any],
) -> Tuple[Dict[str, Dict[str, Any]], Path]:
    control_dir = candidate_dir / "control"
    manifest_path = Path(
        str(meta.get("candidateSourceManifestPath", control_dir / "candidate-source-manifest.json"))
    ).resolve()
    if not is_within(manifest_path, control_dir) or not manifest_path.is_file():
        raise WorkflowError(f"candidate source manifest is missing or outside control: {manifest_path}")
    manifest = parse_manifest_record(read_json(manifest_path))
    expected_hash = meta.get("candidateSourceManifestSha256")
    if not isinstance(expected_hash, str) or not expected_hash:
        raise WorkflowError("candidate source manifest hash is missing from candidate metadata")
    if sha256_file(manifest_path) != expected_hash:
        raise WorkflowError(f"candidate source manifest hash mismatch: {manifest_path}")
    return manifest, manifest_path


def candidate_source_payload(
    candidate_dir: Path,
    meta: Mapping[str, Any],
    external_source: Optional[str],
) -> Tuple[Dict[str, Dict[str, Any]], Path, Path]:
    control_dir = candidate_dir / "control"
    manifest, manifest_path = candidate_source_manifest(candidate_dir, meta)
    tree_value = meta.get("candidateSourceTreePath") or control_dir / "source-tree"
    tree_path = Path(str(tree_value)).resolve()
    if tree_path.is_dir():
        if not is_within(tree_path, control_dir):
            raise WorkflowError(f"candidate source tree is outside candidate control: {tree_path}")
        actual = tree_manifest(tree_path)
        if not manifest_content_equal(actual, manifest):
            raise WorkflowError("candidate source tree does not match candidate source manifest")
        if not source_package_is_readonly(tree_path):
            raise WorkflowError("candidate source tree is not immutable")
        return manifest, tree_path, manifest_path
    if not external_source:
        raise WorkflowError(
            "candidate source payload is missing; provide --source-payload-dir only for an audited legacy recovery"
        )
    external = Path(external_source).resolve()
    if not external.is_dir():
        raise WorkflowError(f"source payload directory does not exist: {external}")
    actual = tree_manifest(external, skip_names={".git"})
    if not manifest_content_equal(actual, manifest):
        raise WorkflowError("legacy source payload does not match candidate source manifest")
    return manifest, external, manifest_path


def candidate_strategy_from_state(state: Mapping[str, Any]) -> str:
    value = state.get("candidateStrategy")
    if value in {"direct", "merge"}:
        return str(value)
    expected = state.get("expectedRFixes")
    if isinstance(expected, list) and len(expected) == 1:
        return "direct"
    return "merge"


def validate_sync_build(candidate_dir: Path, meta: Mapping[str, Any]) -> None:
    """Require the candidate application and its recorded build manifest to agree."""
    issues: List[Dict[str, Any]] = []
    verify_build_record(candidate_dir, meta, issues)
    if issues:
        details = "; ".join(
            str(item.get("code")) + (f": {item.get('message')}" if item.get("message") else "")
            for item in issues
        )
        raise WorkflowError(f"candidate build manifest is not verified: {details}")


def sync_path_conflicts(
    code_root: Path,
    baseline: Mapping[str, Mapping[str, Any]],
    candidate: Mapping[str, Mapping[str, Any]],
    current: Mapping[str, Mapping[str, Any]],
    changed: Iterable[str],
) -> List[str]:
    """Find file/dir/symlink conflicts that a manifest cannot represent."""
    conflicts: Set[str] = set()
    for path in changed:
        target = (code_root / safe_manifest_path(path)).resolve()
        if not is_within(target, code_root):
            conflicts.add(path)
            continue
        expected_before = baseline.get(path)
        if expected_before is None:
            if target.exists() or target.is_symlink():
                conflicts.add(path)
        elif (
            not target.is_file()
            or target.is_symlink()
            or current.get(path, {}).get("sha256") != expected_before.get("sha256")
            or current.get(path, {}).get("size") != expected_before.get("size")
        ):
            conflicts.add(path)

        cursor = target.parent
        while cursor != code_root:
            if cursor.is_symlink() or not cursor.is_dir():
                conflicts.add(path)
                break
            cursor = cursor.parent
    return sorted(conflicts)


def validate_final_candidate_identity(
    review_root: Path,
    batch_id: str,
    candidate_dir: Path,
    strategy: str,
    code_root: Optional[Path] = None,
    snapshot_root: Optional[Path] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    batch_dir = batch_directory(review_root, batch_id)
    candidate_dir = require_within(candidate_dir, batch_dir, "final candidate")
    meta = read_json(candidate_dir / "review-meta.json")
    if meta.get("batchId") != batch_id:
        raise WorkflowError("candidate batch id does not match requested batch")
    candidate_type = "r-only" if strategy == "direct" else "merge"
    if meta.get("candidateType") != candidate_type:
        raise WorkflowError(
            f"candidate strategy {strategy} requires candidateType={candidate_type}, got {meta.get('candidateType')}"
        )
    state = load_batch_state(review_root, batch_id)
    if state.get("status") != "frozen":
        raise WorkflowError("batch state is not frozen")
    if code_root is not None and state.get("codeRoot") and state.get("codeRoot") != path_string(code_root):
        raise WorkflowError("batch state belongs to a different code root")
    if snapshot_root is not None and state.get("snapshotRoot"):
        if Path(str(state.get("snapshotRoot"))).resolve() != snapshot_root.resolve():
            raise WorkflowError("batch state belongs to a different snapshot root")
    actual_strategy = candidate_strategy_from_state(state)
    if actual_strategy != strategy:
        raise WorkflowError(
            f"batch candidate strategy mismatch: state={actual_strategy}, requested={strategy}"
        )
    expected = state.get("expectedRFixes")
    if not isinstance(expected, list) or not expected:
        raise WorkflowError("batch state has no expected R/Fix set")
    state_strategy = candidate_strategy_from_state(state)
    if state_strategy == "direct" and len(expected) != 1:
        raise WorkflowError("batch state direct strategy must contain exactly one expected R/Fix")
    if state_strategy == "merge" and len(expected) < 2:
        raise WorkflowError("batch state merge strategy must contain at least two expected R/Fixes")
    if state_strategy == "direct":
        if len(expected) != 1:
            raise WorkflowError("direct candidate strategy requires exactly one expected R/Fix")
        if meta.get("rId") != expected[0].get("rId") or meta.get("fixId") != expected[0].get("fixId"):
            raise WorkflowError("direct candidate metadata does not match the registered R/Fix")
        expected_dir = batch_dir / f"{expected[0]['rId']}-{expected[0]['fixId']}-only"
        if candidate_dir != expected_dir.resolve():
            raise WorkflowError("direct candidate is not the registered final R/Fix candidate")
    else:
        if candidate_dir != (batch_dir / "merge").resolve():
            raise WorkflowError("merge strategy must use the batch merge candidate")
        if state.get("mergeReviewStatus") != "passed":
            raise WorkflowError("merge candidate review status is not passed in batch-state.json")
        scan = scan_batch_for_final_sync(
            review_root,
            batch_id,
            code_root=code_root,
            snapshot_root=snapshot_root,
        )
        if not scan.get("readyToMerge"):
            raise WorkflowError("merge candidate is blocked until all R-only reviews and artifacts pass scan-batch")
    declared = state.get("finalCandidateDir")
    if declared and Path(str(declared)).resolve() != candidate_dir:
        raise WorkflowError("batch finalCandidateDir does not match requested candidate")
    return meta, state


def validate_approved_source_diff(
    candidate_dir: Path,
    meta: Mapping[str, Any],
    baseline: Mapping[str, Mapping[str, Any]],
    candidate: Mapping[str, Mapping[str, Any]],
    changed: Mapping[str, Optional[Mapping[str, Any]]],
) -> Dict[str, Any]:
    """Validate the immutable source manifest and the exact approved diff."""
    control_dir = candidate_dir / "control"
    manifest_path = Path(
        str(meta.get("candidateSourceManifestPath", control_dir / "candidate-source-manifest.json"))
    ).resolve()
    if not manifest_path.is_file() or not is_within(manifest_path, control_dir):
        raise WorkflowError(f"candidate source manifest is missing or outside control: {manifest_path}")
    expected_manifest_hash = meta.get("candidateSourceManifestSha256")
    if not isinstance(expected_manifest_hash, str) or not expected_manifest_hash:
        raise WorkflowError("candidate source manifest hash is missing from candidate metadata")
    actual_manifest_hash = sha256_file(manifest_path)
    if actual_manifest_hash != expected_manifest_hash:
        raise WorkflowError(f"candidate source manifest hash mismatch: {manifest_path}")
    candidate_fingerprint = manifest_fingerprint(candidate)
    declared_candidate_fingerprint = meta.get("candidateSourceTreeFingerprint")
    if declared_candidate_fingerprint != candidate_fingerprint:
        raise WorkflowError("candidate source tree fingerprint does not match candidate source manifest")

    diff_path = Path(
        str(meta.get("approvedSourceDiffPath", control_dir / "approved-source-diff.json"))
    ).resolve()
    if not diff_path.is_file() or not is_within(diff_path, control_dir):
        raise WorkflowError(f"approved source diff is missing or outside control: {diff_path}")
    expected_diff_file_hash = meta.get("approvedSourceDiffSha256")
    if not isinstance(expected_diff_file_hash, str) or not expected_diff_file_hash:
        raise WorkflowError("approved source diff hash is missing from candidate metadata")
    if sha256_file(diff_path) != expected_diff_file_hash:
        raise WorkflowError(f"approved source diff hash mismatch: {diff_path}")
    diff = read_json(diff_path)
    diff_baseline = parse_manifest_record(diff.get("baselineManifest", {}))
    diff_candidate = parse_manifest_record(diff.get("candidateManifest", {}))
    if not manifest_content_equal(diff_baseline, baseline):
        raise WorkflowError("approved source diff baseline does not match the candidate baseline")
    if not manifest_content_equal(diff_candidate, candidate):
        raise WorkflowError("approved source diff candidate manifest does not match the candidate source")
    expected_changed = [
        {"path": path, "record": changed[path]}
        for path in sorted(changed)
    ]
    if diff.get("changed") != expected_changed:
        raise WorkflowError("approved source diff file set does not match the source manifests")
    expected_diff_fingerprint = approved_diff_fingerprint(changed)
    if diff.get("approvedDiffFingerprint") != expected_diff_fingerprint:
        raise WorkflowError("approved source diff fingerprint does not match the source manifests")
    if meta.get("approvedDiffFingerprint") != expected_diff_fingerprint:
        raise WorkflowError("candidate approved diff fingerprint does not match the source manifests")
    return {
        "manifestPath": path_string(manifest_path),
        "manifestSha256": actual_manifest_hash,
        "diffPath": path_string(diff_path),
        "diffSha256": expected_diff_file_hash,
        "sourceTreeFingerprint": candidate_fingerprint,
        "approvedDiffFingerprint": expected_diff_fingerprint,
    }


def validate_passed_review(
    candidate_dir: Path,
    meta: Mapping[str, Any],
    requested_path: Path,
) -> Tuple[Dict[str, Any], Path]:
    """Validate the latest immutable Review record before any source write."""
    control_dir = candidate_dir / "control"
    requested_path = require_within(requested_path, control_dir, "review status")
    latest, latest_path = latest_review_status(candidate_dir)
    if requested_path != latest_path.resolve():
        raise WorkflowError(
            "sync must use the latest review status record: " + path_string(latest_path)
        )
    if latest.get("status") != "passed":
        raise WorkflowError("final candidate review status is not passed")
    if latest.get("candidateType") != meta.get("candidateType"):
        raise WorkflowError("review status candidate type does not match candidate metadata")
    if latest.get("batchId") != meta.get("batchId"):
        raise WorkflowError("review status batch id does not match candidate metadata")
    if meta.get("rId") is not None and latest.get("rId") != meta.get("rId"):
        raise WorkflowError("review status R id does not match candidate metadata")
    if meta.get("fixId") is not None and latest.get("fixId") != meta.get("fixId"):
        raise WorkflowError("review status Fix id does not match candidate metadata")
    if latest.get("candidateFingerprint") != meta.get("build", {}).get("treeFingerprint"):
        raise WorkflowError("review status candidate fingerprint does not match the build manifest")
    evidence = latest.get("evidence")
    records = latest.get("evidenceRecords")
    if not isinstance(evidence, list) or not evidence or not isinstance(records, list):
        raise WorkflowError("passed review has no complete evidence records")
    record_paths = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("path"), str):
            raise WorkflowError("passed review contains an invalid evidence record")
        evidence_path = Path(record["path"]).resolve()
        if not evidence_path.is_file() or not is_within(evidence_path, candidate_dir / "evidence"):
            raise WorkflowError("passed review evidence is missing or outside the candidate evidence directory")
        if sha256_file(evidence_path) != record.get("sha256") or evidence_path.stat().st_size != record.get("size"):
            raise WorkflowError("passed review evidence hash or size does not match its record")
        record_paths.append(path_string(evidence_path))
    if sorted(record_paths) != sorted(str(item) for item in evidence):
        raise WorkflowError("passed review evidence records do not match the evidence list")
    return latest, latest_path


def scan_batch_for_final_sync(
    review_root: Path,
    batch_id: str,
    code_root: Optional[Path] = None,
    snapshot_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """Scan without reconstructing argparse state for final-candidate validation."""
    if code_root is None:
        code_root = Path(__file__).resolve().parents[1] / "workbuddy"
    if snapshot_root is None:
        snapshot_root = Path(r"E:\workbuddy-snapshots")
    namespace = argparse.Namespace(
        workspace_root=str(code_root.parent),
        code_root=str(code_root),
        review_root=str(review_root),
        snapshot_root=str(snapshot_root),
        batch_id=batch_id,
    )
    return scan_batch(namespace)


def scoped_index_records(
    entries: Iterable[Mapping[str, str]],
    code_root: Path,
) -> Dict[str, List[Dict[str, str]]]:
    git_root = git_root_for(code_root)
    code_relative = code_root.resolve().relative_to(git_root.resolve()).as_posix()
    prefix = "" if code_relative == "." else code_relative.rstrip("/") + "/"
    result: Dict[str, List[Dict[str, str]]] = {}
    for entry in entries:
        path = str(entry.get("path", ""))
        if path == code_relative:
            relative = ""
        elif path.startswith(prefix):
            relative = path[len(prefix):]
        else:
            continue
        result.setdefault(relative, []).append(dict(entry))
    return {path: sorted(values, key=lambda item: (item.get("stage", ""), item.get("sha", ""))) for path, values in result.items()}


def manifest_subset(
    manifest: Mapping[str, Mapping[str, Any]],
    excluded: Set[str],
) -> Dict[str, Dict[str, Any]]:
    return {path: dict(record) for path, record in manifest.items() if path not in excluded}


def source_package_record_path(snapshot_dir: Path) -> Path:
    return snapshot_dir / "control" / "source-package-record.json"


def source_package_is_readonly(root: Path) -> bool:
    for current, directories, files in os.walk(root, followlinks=False):
        for name in directories + files:
            item = Path(current) / name
            if item.is_symlink() or item.stat().st_mode & 0o222:
                return False
    return not bool(root.stat().st_mode & 0o222)


def ensure_source_package(
    snapshot_root: Path,
    batch_id: str,
    candidate_dir: Path,
    meta: Mapping[str, Any],
    baseline: Mapping[str, Mapping[str, Any]],
    candidate: Mapping[str, Mapping[str, Any]],
    payload_root: Path,
) -> Dict[str, Any]:
    snapshot_dir = source_sync_snapshot_directory(snapshot_root, batch_id, candidate_dir)
    changed = changed_entries(baseline, candidate)
    if snapshot_dir.exists():
        record_path = source_package_record_path(snapshot_dir)
        if not record_path.is_file():
            raise WorkflowError(f"source sync snapshot exists without package record: {snapshot_dir}")
        record = read_json(record_path)
        if record.get("batchId") != batch_id or record.get("candidateDir") != path_string(candidate_dir):
            raise WorkflowError("existing source sync snapshot belongs to a different candidate")
        if record.get("sourceManifestSha256") != meta.get("candidateSourceManifestSha256"):
            raise WorkflowError("existing source sync snapshot has a different source manifest")
        source_tree = Path(str(record.get("sourceTreePath", snapshot_dir / "source-tree"))).resolve()
        if not source_tree.is_dir() or not source_package_is_readonly(snapshot_dir):
            raise WorkflowError("existing source sync snapshot is missing or not immutable")
        actual = tree_manifest(source_tree)
        if not manifest_content_equal(actual, candidate):
            raise WorkflowError("existing source sync snapshot source tree was modified")
        if record.get("sourceTreeFingerprint") != manifest_fingerprint(candidate):
            raise WorkflowError("existing source sync snapshot fingerprint does not match the candidate")
        diff_path = Path(
            str(record.get("approvedSourceDiffPath", snapshot_dir / "control" / "approved-source-diff.json"))
        ).resolve()
        if not diff_path.is_file() or sha256_file(diff_path) != record.get("approvedSourceDiffSha256"):
            raise WorkflowError("existing source sync snapshot approved diff is missing or modified")
        if record.get("approvedDiffFingerprint") != approved_diff_fingerprint(changed):
            raise WorkflowError("existing source sync snapshot approved diff fingerprint does not match")
        return record

    snapshot_dir.mkdir(parents=True, exist_ok=False)
    control_dir = snapshot_dir / "control"
    source_tree = snapshot_dir / "source-tree"
    control_dir.mkdir()
    try:
        source_manifest_path = control_dir / "source-manifest.json"
        write_json(source_manifest_path, manifest_payload(candidate))
        copy_manifest_tree(payload_root, candidate, source_tree)
        if not manifest_content_equal(tree_manifest(source_tree), candidate):
            raise WorkflowError("source package tree does not match candidate source manifest")
        diff_payload = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "final-candidate-approved-source-diff",
            "batchId": batch_id,
            "candidateDir": path_string(candidate_dir),
            "candidateType": meta.get("candidateType"),
            "baselineHead": meta.get("baselineHead") or meta.get("baseCommit"),
            "baselineManifest": manifest_payload(baseline),
            "candidateManifest": manifest_payload(candidate),
            "changed": [
                {"path": path, "record": changed[path]}
                for path in sorted(changed)
            ],
            "approvedDiffFingerprint": approved_diff_fingerprint(changed),
        }
        diff_path = control_dir / "approved-source-diff.json"
        write_json(diff_path, diff_payload)
        record = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "final-candidate-source-package",
            "status": "immutable",
            "batchId": batch_id,
            "candidateDir": path_string(candidate_dir),
            "candidateType": meta.get("candidateType"),
            "sourceTreePath": path_string(source_tree),
            "sourceManifestPath": path_string(source_manifest_path),
            "sourceManifestSha256": sha256_file(source_manifest_path),
            "sourceTreeFingerprint": manifest_fingerprint(candidate),
            "approvedSourceDiffPath": path_string(diff_path),
            "approvedSourceDiffSha256": sha256_file(diff_path),
            "approvedDiffFingerprint": approved_diff_fingerprint(changed),
            "fileCount": len(candidate),
            "createdAt": utc_now(),
            "nextAction": "sync-final-candidate",
        }
        write_json(source_package_record_path(snapshot_dir), record)
        make_tree_readonly(snapshot_dir)
        if not source_package_is_readonly(snapshot_dir):
            raise WorkflowError("source sync snapshot could not be made immutable")
        return record
    except Exception:
        remove_tree(snapshot_dir)
        raise


def history_source_recovery_directory(
    snapshot_root: Path,
    batch_id: str,
    candidate_dir: Path,
) -> Path:
    candidate_name = candidate_dir.name
    if candidate_name != "merge" and not R_ONLY_RE.fullmatch(candidate_name):
        raise WorkflowError(f"invalid history source candidate directory name: {candidate_name}")
    return snapshot_root / f"{batch_id}-{candidate_name}-source-recovery"


def validate_history_baseline_snapshot(
    review_root: Path,
    snapshot_root: Path,
    code_root: Path,
    batch_id: str,
    candidate_dir: Path,
    meta: Mapping[str, Any],
) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, str]], str, Dict[str, Any]]:
    """Verify the begin snapshot used to reconstruct a legacy approved diff."""
    r_id = str(meta.get("rId") or "")
    fix_id = str(meta.get("fixId") or "")
    if not r_id or not fix_id:
        raise WorkflowError("history source candidate has no R/Fix identity")
    begin = load_begin(review_root, batch_id, r_id, fix_id)
    validate_begin_identity(begin, code_root, snapshot_root, batch_id, r_id, fix_id)
    baseline = parse_manifest_record(begin.get("baselineManifest", {}))
    baseline_fingerprint = manifest_fingerprint(baseline)
    if begin.get("baselineTreeFingerprint") != baseline_fingerprint:
        raise WorkflowError("begin-fix baseline fingerprint does not match its manifest")

    snapshot_dir = Path(str(begin.get("snapshotRoot", ""))).resolve()
    expected_snapshot_dir = baseline_snapshot_directory(snapshot_root, batch_id, r_id, fix_id).resolve()
    if snapshot_dir != expected_snapshot_dir or not snapshot_dir.is_dir():
        raise WorkflowError("begin-fix baseline snapshot path is missing or does not match")
    snapshot_manifest_path = snapshot_dir / "manifest.json"
    snapshot_record_path = snapshot_dir / "snapshot-record.json"
    if not snapshot_manifest_path.is_file() or not snapshot_record_path.is_file():
        raise WorkflowError("begin-fix baseline snapshot metadata is incomplete")
    snapshot_manifest = parse_manifest_record(read_json(snapshot_manifest_path))
    if not manifest_content_equal(snapshot_manifest, baseline):
        raise WorkflowError("begin-fix snapshot manifest does not match begin-fix state")
    snapshot_record = read_json(snapshot_record_path)
    if (
        snapshot_record.get("kind") != "r-fix-baseline-snapshot"
        or snapshot_record.get("batchId") != batch_id
        or snapshot_record.get("rId") != r_id
        or snapshot_record.get("fixId") != fix_id
        or snapshot_record.get("treeFingerprint") != baseline_fingerprint
    ):
        raise WorkflowError("begin-fix baseline snapshot record does not match the candidate")

    snapshot_tree = tree_manifest(snapshot_dir)
    metadata_paths = {
        "git-index",
        "git-status.txt",
        "manifest.json",
        "snapshot-record.json",
    }
    unexpected = sorted(set(snapshot_tree) - set(baseline) - metadata_paths)
    if unexpected:
        raise WorkflowError(
            "begin-fix baseline snapshot contains unrecorded source files: "
            + ", ".join(unexpected)
        )
    snapshot_source = {
        path: record for path, record in snapshot_tree.items() if path in baseline
    }
    if not manifest_content_equal(snapshot_source, baseline):
        raise WorkflowError("begin-fix baseline snapshot source tree does not match its manifest")

    index_entries = begin.get("baselineIndexEntries", [])
    if not isinstance(index_entries, list):
        raise WorkflowError("begin-fix state has invalid baseline index entries")
    baseline_head = str(begin.get("baselineHead") or "")
    if not baseline_head:
        raise WorkflowError("begin-fix state has no baseline HEAD")
    provenance = {
        "baselineSnapshotVerified": True,
        "baselineSnapshotPath": path_string(snapshot_dir),
        "baselineManifestPath": path_string(snapshot_manifest_path),
        "baselineManifestSha256": sha256_file(snapshot_manifest_path),
        "baselineSnapshotRecordPath": path_string(snapshot_record_path),
        "baselineSnapshotRecordSha256": sha256_file(snapshot_record_path),
        "baselineTreeFingerprint": baseline_fingerprint,
        "baselineFileCount": len(baseline),
    }
    return baseline, [dict(item) for item in index_entries], baseline_head, provenance


def legacy_approved_diff_payload(
    batch_id: str,
    candidate_dir: Path,
    meta: Mapping[str, Any],
    baseline: Mapping[str, Mapping[str, Any]],
    baseline_index: Iterable[Mapping[str, str]],
    baseline_head: str,
    candidate: Mapping[str, Mapping[str, Any]],
    manifest_path: Path,
) -> Dict[str, Any]:
    changed = changed_entries(baseline, candidate)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "approved-source-diff",
        "batchId": batch_id,
        "rId": meta.get("rId"),
        "fixId": meta.get("fixId"),
        "candidateType": meta.get("candidateType"),
        "candidateDir": path_string(candidate_dir),
        "baselineHead": baseline_head,
        "baselineIndexEntries": [dict(item) for item in baseline_index],
        "baselineManifest": manifest_payload(baseline),
        "candidateManifest": manifest_payload(candidate),
        "candidateSourceManifestPath": path_string(manifest_path),
        "candidateSourceManifestSha256": sha256_file(manifest_path),
        "candidateSourceTreeFingerprint": manifest_fingerprint(candidate),
        "changed": [
            {"path": path, "record": changed[path]}
            for path in sorted(changed)
        ],
        "approvedDiffFingerprint": approved_diff_fingerprint(changed),
    }


def source_evidence_records(values: Iterable[str]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    seen: Set[Path] = set()
    for value in values:
        path = Path(value).resolve()
        if path in seen:
            continue
        if not path.is_file():
            raise WorkflowError(f"history source evidence does not exist: {path}")
        seen.add(path)
        records.append(
            {
                "path": path_string(path),
                "sha256": sha256_file(path),
                "size": path.stat().st_size,
            }
        )
    return sorted(records, key=lambda item: item["path"])


def validate_recovery_approved_diff(
    diff_path: Path,
    diff_hash: str,
    allowed_control: Path,
    meta: Mapping[str, Any],
    baseline: Mapping[str, Mapping[str, Any]],
    candidate: Mapping[str, Mapping[str, Any]],
) -> Dict[str, Any]:
    diff_path = diff_path.resolve()
    if not diff_path.is_file() or not is_within(diff_path, allowed_control):
        raise WorkflowError("history recovery approved source diff is missing or outside control")
    if not diff_hash or sha256_file(diff_path) != diff_hash:
        raise WorkflowError("history recovery approved source diff hash mismatch")
    diff = read_json(diff_path)
    diff_baseline = parse_manifest_record(diff.get("baselineManifest", {}))
    diff_candidate = parse_manifest_record(diff.get("candidateManifest", {}))
    if not manifest_content_equal(diff_baseline, baseline):
        raise WorkflowError("history recovery approved diff baseline does not match begin-fix")
    if not manifest_content_equal(diff_candidate, candidate):
        raise WorkflowError("history recovery approved diff candidate does not match source manifest")
    changed = changed_entries(baseline, candidate)
    expected_changed = [
        {"path": path, "record": changed[path]} for path in sorted(changed)
    ]
    if diff.get("changed") != expected_changed:
        raise WorkflowError("history recovery approved diff file set does not match source manifests")
    fingerprint = approved_diff_fingerprint(changed)
    if diff.get("approvedDiffFingerprint") != fingerprint:
        raise WorkflowError("history recovery approved diff fingerprint does not match source manifests")
    if meta.get("approvedDiffFingerprint") != fingerprint:
        raise WorkflowError("candidate approved diff fingerprint does not match reconstructed source diff")
    return {
        "diffPath": path_string(diff_path),
        "diffSha256": diff_hash,
        "sourceTreeFingerprint": manifest_fingerprint(candidate),
        "approvedDiffFingerprint": fingerprint,
    }


def verified_history_source_recovery(
    snapshot_root: Path,
    batch_id: str,
    candidate_dir: Path,
    meta: Mapping[str, Any],
    baseline: Mapping[str, Mapping[str, Any]],
    candidate: Mapping[str, Mapping[str, Any]],
) -> Tuple[Dict[str, Any], Path, Dict[str, Any]]:
    recovery_dir = history_source_recovery_directory(snapshot_root, batch_id, candidate_dir).resolve()
    result_path = recovery_dir / "control" / "history-source-recovery-result.json"
    if not result_path.is_file():
        raise WorkflowError(
            "candidate source payload is missing and no verified history recovery package exists"
        )
    result = read_json(result_path)
    if (
        result.get("kind") != "history-source-recovery"
        or result.get("sourceRecoveryStatus") != "verified"
        or result.get("batchId") != batch_id
        or Path(str(result.get("candidateDir", ""))).resolve() != candidate_dir.resolve()
        or result.get("candidateType") != meta.get("candidateType")
        or result.get("candidateSourceManifestSha256")
        != meta.get("candidateSourceManifestSha256")
    ):
        raise WorkflowError("history source recovery record does not match the final candidate")
    if not source_package_is_readonly(recovery_dir):
        raise WorkflowError("history source recovery package is not immutable")

    recovery_control = recovery_dir / "control"
    recovery_manifest_path = Path(str(result.get("sourceManifestPath", ""))).resolve()
    if (
        not recovery_manifest_path.is_file()
        or not is_within(recovery_manifest_path, recovery_control)
        or sha256_file(recovery_manifest_path) != result.get("sourceManifestSha256")
    ):
        raise WorkflowError("history source recovery manifest is missing or modified")
    recovery_manifest = parse_manifest_record(read_json(recovery_manifest_path))
    if not manifest_content_equal(recovery_manifest, candidate):
        raise WorkflowError("history source recovery manifest does not match the candidate")

    source_tree = Path(str(result.get("sourceTreePath", ""))).resolve()
    if not source_tree.is_dir() or not is_within(source_tree, recovery_dir):
        raise WorkflowError("history source recovery tree is missing or outside its package")
    if not manifest_content_equal(tree_manifest(source_tree), candidate):
        raise WorkflowError("history source recovery tree does not match the candidate")
    candidate_fingerprint = manifest_fingerprint(candidate)
    if result.get("sourceTreeFingerprint") != candidate_fingerprint:
        raise WorkflowError("history source recovery tree fingerprint does not match the candidate")
    declared_candidate_fingerprint = meta.get("candidateSourceTreeFingerprint")
    if declared_candidate_fingerprint and declared_candidate_fingerprint != candidate_fingerprint:
        raise WorkflowError("candidate source tree fingerprint does not match its source manifest")

    diff_validation = validate_recovery_approved_diff(
        Path(str(result.get("approvedSourceDiffPath", ""))),
        str(result.get("approvedSourceDiffSha256") or ""),
        recovery_control,
        meta,
        baseline,
        candidate,
    )
    if result.get("approvedDiffFingerprint") != diff_validation["approvedDiffFingerprint"]:
        raise WorkflowError("history source recovery record has a different approved diff fingerprint")
    diff_validation["manifestPath"] = path_string(recovery_manifest_path)
    diff_validation["manifestSha256"] = str(result.get("sourceManifestSha256"))
    diff_validation["approvedDiffOrigin"] = "verified-history-recovery"
    diff_validation["historySourceRecoveryResultPath"] = path_string(result_path)
    return result, source_tree, diff_validation


def recover_history_source_package(args: argparse.Namespace) -> Dict[str, Any]:
    """Validate and preserve a complete source tree for an auditable old S package."""
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    batch_dir = batch_directory(review_root, args.batch_id)
    candidate_dir = require_within(Path(args.candidate_dir), batch_dir, "history source candidate")
    meta = read_json(candidate_dir / "review-meta.json")
    if meta.get("batchId") != args.batch_id or meta.get("candidateType") != "r-only":
        raise WorkflowError("history source recovery requires an R-only candidate from the requested batch")
    source_dir = Path(args.source_dir).resolve()
    if not source_dir.is_dir():
        raise WorkflowError(f"history source directory does not exist: {source_dir}")
    if is_within(source_dir, candidate_dir):
        raise WorkflowError("history source must not be recovered from the candidate artifact directory")
    if source_dir.name.lower() in {"app", "out", "dist", "build", "evidence", "userdata", "control"}:
        raise WorkflowError("history source directory is a build/review artifact directory")

    control_dir = candidate_dir / "control"
    manifest_path = Path(
        str(meta.get("candidateSourceManifestPath", control_dir / "candidate-source-manifest.json"))
    ).resolve()
    if not is_within(manifest_path, control_dir) or not manifest_path.is_file():
        raise WorkflowError(f"candidate source manifest is missing or outside control: {manifest_path}")
    expected_manifest_hash = meta.get("candidateSourceManifestSha256")
    if not isinstance(expected_manifest_hash, str) or sha256_file(manifest_path) != expected_manifest_hash:
        raise WorkflowError("candidate source manifest hash is missing or does not match candidate metadata")
    expected_manifest = parse_manifest_record(read_json(manifest_path))

    baseline, baseline_index, baseline_head, baseline_provenance = validate_history_baseline_snapshot(
        review_root,
        snapshot_root,
        code_root,
        args.batch_id,
        candidate_dir,
        meta,
    )
    changed = changed_entries(baseline, expected_manifest)
    declared = meta.get("candidateChangedFiles") or meta.get("approvedChangedFiles") or []
    if sorted(str(item) for item in declared) != sorted(changed):
        raise WorkflowError("candidate approved changed files do not match reconstructed source manifests")
    expected_diff_fingerprint = approved_diff_fingerprint(changed)
    if meta.get("approvedDiffFingerprint") != expected_diff_fingerprint:
        raise WorkflowError("candidate approved diff fingerprint does not match reconstructed source diff")
    candidate_fingerprint = manifest_fingerprint(expected_manifest)
    declared_candidate_fingerprint = meta.get("candidateSourceTreeFingerprint")
    if declared_candidate_fingerprint and declared_candidate_fingerprint != candidate_fingerprint:
        raise WorkflowError("candidate source tree fingerprint does not match candidate source manifest")

    diff_path = Path(
        str(meta.get("approvedSourceDiffPath", control_dir / "approved-source-diff.json"))
    ).resolve()
    diff_origin = "candidate-approved-source-diff"
    diff_payload: Optional[Dict[str, Any]] = None
    if diff_path.is_file():
        if not is_within(diff_path, control_dir):
            raise WorkflowError(f"approved source diff is outside candidate control: {diff_path}")
        expected_diff_hash = meta.get("approvedSourceDiffSha256")
        if not isinstance(expected_diff_hash, str) or not expected_diff_hash:
            raise WorkflowError("candidate approved source diff hash is missing")
        validate_recovery_approved_diff(
            diff_path,
            expected_diff_hash,
            control_dir,
            meta,
            baseline,
            expected_manifest,
        )
    else:
        if meta.get("approvedSourceDiffPath") or meta.get("approvedSourceDiffSha256"):
            raise WorkflowError("declared candidate approved source diff is missing")
        diff_origin = "reconstructed-from-begin-baseline"
        diff_payload = legacy_approved_diff_payload(
            args.batch_id,
            candidate_dir,
            meta,
            baseline,
            baseline_index,
            baseline_head,
            expected_manifest,
            manifest_path,
        )

    actual_manifest = tree_manifest(source_dir, skip_names={".git"})
    required = [
        normalise_relative(value, source_dir, "required history source file")
        for value in (args.required_source_file or [])
    ]
    missing_required = sorted(
        path for path in required if path not in expected_manifest or path not in actual_manifest
    )
    if missing_required:
        raise WorkflowError(
            "history source is missing required files: " + ", ".join(missing_required)
        )
    if not manifest_content_equal(actual_manifest, expected_manifest):
        raise WorkflowError("history source tree does not match the candidate source manifest")
    evidence_records = source_evidence_records(args.source_evidence or [])
    reconstruction_notes = sorted(set(str(item) for item in (args.reconstruction_note or []) if str(item)))

    recovery_dir = history_source_recovery_directory(snapshot_root, args.batch_id, candidate_dir)
    result_path = recovery_dir / "control" / "history-source-recovery-result.json"
    if recovery_dir.exists():
        if not result_path.is_file():
            raise WorkflowError(f"history source recovery directory exists without a result: {recovery_dir}")
        existing = read_json(result_path)
        if (
            existing.get("sourceRecoveryStatus") != "verified"
            or existing.get("candidateSourceManifestSha256") != expected_manifest_hash
            or existing.get("approvedDiffFingerprint") != expected_diff_fingerprint
            or existing.get("sourceEvidenceRecords", []) != evidence_records
            or existing.get("reconstructionNotes", []) != reconstruction_notes
            or not set(required).issubset(set(existing.get("requiredSourceFiles", [])))
        ):
            raise WorkflowError("history source recovery directory exists with different or invalid contents")
        verified, _, _ = verified_history_source_recovery(
            snapshot_root,
            args.batch_id,
            candidate_dir,
            meta,
            baseline,
            expected_manifest,
        )
        return {
            "ok": True,
            "command": "recover-history-source-package",
            "idempotent": True,
            "result": verified,
        }

    recovery_control = recovery_dir / "control"
    source_tree = recovery_dir / "source-tree"
    recovery_control.mkdir(parents=True, exist_ok=False)
    try:
        recovery_manifest_path = recovery_control / "candidate-source-manifest.json"
        write_json(recovery_manifest_path, manifest_payload(expected_manifest))
        recovery_diff_path = recovery_control / "approved-source-diff.json"
        if diff_payload is None:
            shutil.copy2(diff_path, recovery_diff_path)
        else:
            write_json(recovery_diff_path, diff_payload)
        copy_manifest_tree(source_dir, expected_manifest, source_tree)
        if not manifest_content_equal(tree_manifest(source_tree), expected_manifest):
            raise WorkflowError("recovered history source tree does not match the candidate source manifest")
        result = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "history-source-recovery",
            "sourceRecoveryStatus": "verified",
            "batchId": args.batch_id,
            "candidateDir": path_string(candidate_dir),
            "candidateType": meta.get("candidateType"),
            "sourceInputDir": path_string(source_dir),
            "sourceTreePath": path_string(source_tree),
            "sourceManifestPath": path_string(recovery_manifest_path),
            "sourceManifestSha256": sha256_file(recovery_manifest_path),
            "candidateSourceManifestSha256": expected_manifest_hash,
            "sourceTreeFingerprint": candidate_fingerprint,
            "approvedSourceDiffPath": path_string(recovery_diff_path),
            "approvedSourceDiffSha256": sha256_file(recovery_diff_path),
            "approvedDiffFingerprint": expected_diff_fingerprint,
            "approvedDiffOrigin": diff_origin,
            **baseline_provenance,
            "sourceEvidenceRecords": evidence_records,
            "reconstructionNotes": reconstruction_notes,
            "requiredSourceFiles": sorted(required),
            "fileCount": len(expected_manifest),
            "createdAt": utc_now(),
            "nextAction": "15A-sync-final-candidate",
        }
        write_json(result_path, result)
        make_tree_readonly(recovery_dir)
        if not source_package_is_readonly(recovery_dir):
            raise WorkflowError("history source recovery package could not be made immutable")
        return {
            "ok": True,
            "command": "recover-history-source-package",
            "idempotent": False,
            "result": result,
        }
    except Exception:
        remove_tree(recovery_dir)
        raise


def sync_index_conflicts(
    current_entries: Iterable[Mapping[str, str]],
    baseline_entries: Iterable[Mapping[str, str]],
    changed: Set[str],
    code_root: Path,
) -> List[str]:
    current = scoped_index_records(current_entries, code_root)
    baseline = scoped_index_records(baseline_entries, code_root)
    conflicts = []
    for path in sorted(changed):
        if current.get(path, []) != baseline.get(path, []):
            conflicts.append(path)
    return conflicts


def copy_sync_backup(
    code_root: Path,
    current_manifest: Mapping[str, Mapping[str, Any]],
    changed: Mapping[str, Optional[Mapping[str, Any]]],
    backup_root: Path,
) -> None:
    for path in sorted(changed):
        if path not in current_manifest:
            continue
        source = (code_root / safe_manifest_path(path)).resolve()
        if not is_within(source, code_root) or not source.is_file():
            raise WorkflowError(f"cannot back up sync target: {source}")
        target = backup_root / safe_manifest_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def restore_sync_backup(
    code_root: Path,
    before_manifest: Mapping[str, Mapping[str, Any]],
    changed: Mapping[str, Optional[Mapping[str, Any]]],
    backup_root: Path,
) -> None:
    for path in sorted(changed):
        target = (code_root / safe_manifest_path(path)).resolve()
        if not is_within(target, code_root):
            raise WorkflowError(f"sync rollback target is outside code root: {target}")
        if path in before_manifest:
            source = (backup_root / safe_manifest_path(path)).resolve()
            if not source.is_file():
                raise WorkflowError(f"sync rollback source is missing: {source}")
            if target.exists() and (target.is_symlink() or target.is_dir()):
                raise WorkflowError(f"sync rollback target is not a regular file: {target}")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif target.exists():
            if target.is_symlink() or target.is_dir():
                raise WorkflowError(f"sync rollback cannot remove non-file target: {target}")
            target.unlink()


def apply_sync_diff(
    code_root: Path,
    source_root: Path,
    changed: Mapping[str, Optional[Mapping[str, Any]]],
) -> List[str]:
    applied: List[str] = []
    for path in sorted(changed):
        target = (code_root / safe_manifest_path(path)).resolve()
        if not is_within(target, code_root):
            raise WorkflowError(f"sync target is outside code root: {target}")
        record = changed[path]
        if record is None:
            if target.exists():
                if target.is_symlink() or target.is_dir():
                    raise WorkflowError(f"sync delete target is not a regular file: {target}")
                target.unlink()
            applied.append(path)
            continue
        source = (source_root / safe_manifest_path(path)).resolve()
        if not is_within(source, source_root) or not source.is_file():
            raise WorkflowError(f"candidate source file is missing: {source}")
        if target.exists() and (target.is_symlink() or target.is_dir()):
            raise WorkflowError(f"sync target is not a regular file: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if record.get("mode") is not None:
            target.chmod((target.stat().st_mode & ~0o777) | int(record["mode"]))
        applied.append(path)
    return applied


def write_source_sync_result(review_root: Path, batch_id: str, result: Mapping[str, Any]) -> None:
    write_json(source_sync_result_path(review_root, batch_id), result)


def record_sync_gate_failure(args: argparse.Namespace, error: Exception) -> Optional[Dict[str, Any]]:
    """Persist a blocked/failed CLI precondition so a rejected 15A run is auditable."""
    try:
        _, code_root, review_root, _ = resolve_paths(args)
        require_id(args.batch_id, BATCH_RE, "batch id")
        result_path = source_sync_result_path(review_root, args.batch_id)
        current: Dict[str, Any] = {}
        try:
            current = capture_code_state(code_root)
        except WorkflowError:
            pass
        status = "failed" if not isinstance(error, WorkflowError) else "blocked"
        result = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "b-final-candidate-source-sync",
            "sourceSyncStatus": status,
            "batchId": args.batch_id,
            "candidateDir": path_string(Path(args.candidate_dir).resolve()) if getattr(args, "candidate_dir", "") else None,
            "candidateStrategy": getattr(args, "candidate_strategy", None),
            "reviewStatusPath": path_string(Path(args.review_status).resolve()) if getattr(args, "review_status", "") else None,
            "beforeWorkspaceFingerprint": current.get("workspaceFingerprint"),
            "afterWorkspaceFingerprint": current.get("workspaceFingerprint"),
            "appliedFiles": [],
            "preservedFiles": [],
            "conflicts": [],
            "error": str(error),
            "updatedAt": utc_now(),
            "nextAction": "resolve-source-sync-conflict" if status == "blocked" else "stop-and-investigate-source-sync",
        }
        write_source_sync_result(review_root, args.batch_id, result)
        state_path = batch_control(review_root, args.batch_id) / "batch-state.json"
        if state_path.is_file():
            state = read_json(state_path)
            state["sourceSyncStatus"] = status
            state["sourceSyncResultPath"] = path_string(result_path)
            state["operationalClosureStatus"] = "blocked" if status == "blocked" else "failed"
            state["nextAction"] = result["nextAction"]
            state["updatedAt"] = result["updatedAt"]
            write_json(state_path, state)
        return result
    except (OSError, WorkflowError, TypeError, ValueError):
        return None


def sync_final_candidate(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    if args.candidate_strategy not in {"direct", "merge"}:
        raise WorkflowError(f"invalid candidate strategy: {args.candidate_strategy}")

    candidate_dir = Path(args.candidate_dir).resolve()
    requested_review_status_path = Path(args.review_status).resolve()
    control_dir = batch_control(review_root, args.batch_id)
    result_path = source_sync_result_path(review_root, args.batch_id)

    def persist_state(state: Mapping[str, Any], result: Mapping[str, Any]) -> None:
        updated = dict(state)
        updated["sourceSyncStatus"] = result.get("sourceSyncStatus")
        updated["sourceSyncResultPath"] = path_string(result_path)
        updated["finalCandidateDir"] = result.get("candidateDir")
        if result.get("sourceSyncStatus") == "verified":
            updated["operationalClosureStatus"] = "verified"
            updated["nextAction"] = "15-freeze-qa-s"
        elif result.get("sourceSyncStatus") == "blocked":
            updated["operationalClosureStatus"] = "blocked"
            updated["nextAction"] = "resolve-source-sync-conflict"
        else:
            updated["operationalClosureStatus"] = "failed"
            updated["nextAction"] = "stop-and-investigate-source-sync"
        updated["updatedAt"] = result.get("updatedAt", utc_now())
        write_json(batch_control(review_root, args.batch_id) / "batch-state.json", updated)

    def base_result(
        status: str,
        meta: Mapping[str, Any],
        package: Mapping[str, Any],
        source_tree: Path,
        review_status_path: Path,
        candidate_fingerprint: str,
        diff_fingerprint: str,
        before: Mapping[str, Any],
        conflicts: Iterable[str],
        applied: Iterable[str],
        preserved: Iterable[str],
        next_action: str,
    ) -> Dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "b-final-candidate-source-sync",
            "sourceSyncStatus": status,
            "batchId": args.batch_id,
            "candidateDir": path_string(candidate_dir),
            "candidateStrategy": args.candidate_strategy,
            "reviewStatusPath": path_string(review_status_path),
            "candidateSourceManifestSha256": meta.get("candidateSourceManifestSha256"),
            "candidateSourceTreeFingerprint": candidate_fingerprint,
            "approvedDiffFingerprint": diff_fingerprint,
            "sourcePackageDir": path_string(source_tree.parent),
            "sourcePackageManifestSha256": package.get("sourceManifestSha256"),
            "sourcePackageReadOnly": source_package_is_readonly(source_tree.parent),
            "beforeWorkspaceFingerprint": before.get("workspaceFingerprint"),
            "afterWorkspaceFingerprint": before.get("workspaceFingerprint"),
            "appliedFiles": sorted(set(applied)),
            "preservedFiles": sorted(set(preserved)),
            "conflicts": sorted(set(conflicts)),
            "updatedAt": utc_now(),
            "nextAction": next_action,
        }

    with directory_lock(control_dir / ".source-sync.lock"):
        meta, state = validate_final_candidate_identity(
            review_root,
            args.batch_id,
            candidate_dir,
            args.candidate_strategy,
            code_root=code_root,
            snapshot_root=snapshot_root,
        )
        validate_sync_build(candidate_dir, meta)
        _, latest_status_path = validate_passed_review(
            candidate_dir,
            meta,
            requested_review_status_path,
        )
        requested_review_status_path = latest_status_path.resolve()
        if meta.get("reviewStatus") != "passed":
            raise WorkflowError("candidate review-meta.json is not marked passed")
        latest_status = read_json(requested_review_status_path)
        if latest_status.get("reviewId") != meta.get("reviewId"):
            raise WorkflowError("review status does not match candidate review-meta.json")

        baseline_manifest, baseline_index, baseline_head = candidate_baseline_manifest(
            review_root,
            args.batch_id,
            candidate_dir,
            meta,
        )
        candidate_control = candidate_dir / "control"
        declared_source_tree = meta.get("candidateSourceTreePath")
        default_source_tree = candidate_control / "source-tree"
        recovery_record: Optional[Dict[str, Any]] = None
        if (
            not declared_source_tree
            and not default_source_tree.is_dir()
            and not args.source_payload_dir
        ):
            candidate_manifest, _ = candidate_source_manifest(candidate_dir, meta)
            recovery_record, payload_root, source_validation = verified_history_source_recovery(
                snapshot_root,
                args.batch_id,
                candidate_dir,
                meta,
                baseline_manifest,
                candidate_manifest,
            )
        else:
            candidate_manifest, payload_root, _ = candidate_source_payload(
                candidate_dir,
                meta,
                args.source_payload_dir,
            )
            source_validation = {}
        changed = changed_entries(baseline_manifest, candidate_manifest)
        declared = meta.get("candidateChangedFiles") or meta.get("approvedChangedFiles") or []
        if sorted(str(item) for item in declared) != sorted(changed):
            raise WorkflowError("candidate approved changed files do not match the source manifests")
        if recovery_record is None:
            source_validation = validate_approved_source_diff(
                candidate_dir,
                meta,
                baseline_manifest,
                candidate_manifest,
                changed,
            )
            source_validation["approvedDiffOrigin"] = "candidate-control"
        package = ensure_source_package(
            snapshot_root,
            args.batch_id,
            candidate_dir,
            meta,
            baseline_manifest,
            candidate_manifest,
            payload_root,
        )
        source_tree = Path(str(package["sourceTreePath"])).resolve()

        current = capture_code_state(code_root)
        current_manifest = parse_manifest_record(current["manifest"])

        # A verified result is immutable evidence.  Re-running the command is
        # idempotent only when the worktree still matches that recorded result.
        if result_path.is_file():
            existing_result = read_json(result_path)
            if (
                existing_result.get("sourceSyncStatus") == "verified"
                and existing_result.get("batchId") == args.batch_id
                and Path(str(existing_result.get("candidateDir", ""))).resolve() == candidate_dir
                and existing_result.get("candidateStrategy") == args.candidate_strategy
                and existing_result.get("candidateSourceManifestSha256")
                == meta.get("candidateSourceManifestSha256")
                and existing_result.get("approvedDiffFingerprint")
                == source_validation["approvedDiffFingerprint"]
            ):
                expected_after = existing_result.get("afterWorkspaceFingerprint")
                if expected_after != current.get("workspaceFingerprint"):
                    raise WorkflowError(
                        "previously verified source synchronization no longer matches the current worktree"
                    )
                pointer_path = development_pointer_path(review_root)
                pointer = read_json(pointer_path) if pointer_path.is_file() else None
                if pointer is None or pointer.get("workspaceFingerprint") != current.get("workspaceFingerprint"):
                    pointer = {
                        "schemaVersion": SCHEMA_VERSION,
                        "kind": "current-development-pointer",
                        "sourceSyncStatus": "verified",
                        "batchId": args.batch_id,
                        "candidateDir": path_string(candidate_dir),
                        "candidateStrategy": args.candidate_strategy,
                        "sourceSyncResultPath": path_string(result_path),
                        "sourcePackageDir": path_string(source_tree.parent),
                        "codeRoot": path_string(code_root),
                        "gitRoot": path_string(git_root_for(code_root)),
                        "head": current["head"],
                        "status": current["status"],
                        "indexSha256": current["indexSha256"],
                        "treeFingerprint": current["treeFingerprint"],
                        "workspaceFingerprint": current["workspaceFingerprint"],
                        "candidateSourceManifestSha256": meta.get("candidateSourceManifestSha256"),
                        "candidateSourceTreeFingerprint": source_validation["sourceTreeFingerprint"],
                        "approvedDiffFingerprint": source_validation["approvedDiffFingerprint"],
                        "updatedAt": utc_now(),
                        "updatedBy": "workflow-tool",
                        "nextAction": "15-freeze-qa-s",
                    }
                    write_json(pointer_path, pointer)
                persist_state(state, existing_result)
                return {
                    "ok": True,
                    "command": "sync-final-candidate",
                    "idempotent": True,
                    "result": existing_result,
                    "pointer": pointer,
                }

        conflicts: List[str] = []
        applied: List[str] = []
        package_dir = source_tree.parent
        pointer_path = development_pointer_path(review_root)
        pointer = read_json(pointer_path) if pointer_path.is_file() else None

        if baseline_head and current.get("head") != baseline_head:
            conflicts.append("<HEAD>")

        if args.candidate_strategy == "direct":
            if pointer is not None:
                if pointer.get("codeRoot") != path_string(code_root):
                    conflicts.append("<development-pointer-root>")
                if pointer.get("head") and current.get("head") != pointer.get("head"):
                    conflicts.append("<development-pointer-head>")
            conflicts.extend(
                sync_path_conflicts(
                    code_root,
                    baseline_manifest,
                    candidate_manifest,
                    current_manifest,
                    changed,
                )
            )
            conflicts.extend(
                sync_index_conflicts(
                    current.get("indexEntries", []),
                    baseline_index,
                    set(changed),
                    code_root,
                )
            )
        else:
            if not manifest_content_equal(current_manifest, candidate_manifest):
                conflicts.append("<merge-worktree>")

        conflicts = sorted(set(conflicts))
        if conflicts:
            result = base_result(
                "blocked",
                meta,
                package,
                source_tree,
                requested_review_status_path,
                source_validation["sourceTreeFingerprint"],
                source_validation["approvedDiffFingerprint"],
                current,
                conflicts,
                [],
                manifest_subset(current_manifest, set(changed)),
                "resolve-source-sync-conflict",
            )
            write_source_sync_result(review_root, args.batch_id, result)
            persist_state(state, result)
            return {
                "ok": False,
                "command": "sync-final-candidate",
                "result": result,
            }

        after = current
        sync_mode = "verified-existing"
        if args.candidate_strategy == "direct":
            backup_root = Path(
                tempfile.mkdtemp(
                    prefix=f".{args.batch_id}-source-sync-",
                    dir=str(snapshot_root),
                )
            )
            keep_backup = False
            try:
                copy_sync_backup(code_root, current_manifest, changed, backup_root)
                applied = apply_sync_diff(code_root, source_tree, changed)
                after = capture_code_state(code_root)
                after_manifest = parse_manifest_record(after["manifest"])
                expected_after_manifest = dict(current_manifest)
                for path, record in changed.items():
                    if record is None:
                        expected_after_manifest.pop(path, None)
                    else:
                        expected_after_manifest[path] = dict(record)
                if not manifest_content_equal(after_manifest, expected_after_manifest):
                    raise WorkflowError(
                        "synchronized worktree does not match the expected candidate diff"
                    )
                if not manifest_content_equal(
                    manifest_subset(after_manifest, set(changed)),
                    manifest_subset(current_manifest, set(changed)),
                ):
                    raise WorkflowError(
                        "unapproved worktree files changed during source synchronization"
                    )
                sync_mode = "applied-approved-diff"
            except Exception as exc:
                try:
                    restore_sync_backup(code_root, current_manifest, changed, backup_root)
                    rollback_state = capture_code_state(code_root)
                    if rollback_state.get("workspaceFingerprint") != current.get("workspaceFingerprint"):
                        raise WorkflowError("source synchronization rollback fingerprint mismatch")
                except Exception as rollback_exc:
                    keep_backup = True
                    result = base_result(
                        "failed",
                        meta,
                        package,
                        source_tree,
                        requested_review_status_path,
                        source_validation["sourceTreeFingerprint"],
                        source_validation["approvedDiffFingerprint"],
                        current,
                        conflicts,
                        applied,
                        manifest_subset(current_manifest, set(changed)),
                        "stop-and-investigate-source-sync-rollback",
                    )
                    result["error"] = str(exc)
                    result["rollbackError"] = str(rollback_exc)
                    result["residualBackupDir"] = path_string(backup_root)
                    write_source_sync_result(review_root, args.batch_id, result)
                    persist_state(state, result)
                    raise WorkflowError(
                        "source synchronization failed and rollback was not verified"
                    ) from rollback_exc
                raise WorkflowError(
                    f"source synchronization failed and was rolled back: {exc}"
                ) from exc
            finally:
                if not keep_backup:
                    remove_tree(backup_root)
        else:
            # The merge candidate is already the integrated development tree.
            # 15A verifies it and records the pointer; it does not rewrite it.
            after = capture_code_state(code_root)

        result = base_result(
            "verified",
            meta,
            package,
            source_tree,
            requested_review_status_path,
            source_validation["sourceTreeFingerprint"],
            source_validation["approvedDiffFingerprint"],
            current,
            conflicts,
            applied,
            manifest_subset(current_manifest, set(changed)),
            "15-freeze-qa-s",
        )
        result["afterWorkspaceFingerprint"] = after.get("workspaceFingerprint")
        result["afterTreeFingerprint"] = after.get("treeFingerprint")
        result["afterHead"] = after.get("head")
        result["baselineHead"] = baseline_head
        result["syncMode"] = sync_mode
        result["sourcePackageReadOnly"] = source_package_is_readonly(package_dir)
        result["sourceValidation"] = source_validation

        # The result is the single machine fact.  Persist it before advancing
        # the development pointer so a pointer write failure cannot erase the
        # synchronization evidence.
        write_source_sync_result(review_root, args.batch_id, result)
        pointer = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "current-development-pointer",
            "sourceSyncStatus": "verified",
            "batchId": args.batch_id,
            "candidateDir": path_string(candidate_dir),
            "candidateStrategy": args.candidate_strategy,
            "sourceSyncResultPath": path_string(result_path),
            "sourcePackageDir": path_string(package_dir),
            "codeRoot": path_string(code_root),
            "gitRoot": path_string(git_root_for(code_root)),
            "head": after["head"],
            "status": after["status"],
            "indexSha256": after["indexSha256"],
            "treeFingerprint": after["treeFingerprint"],
            "workspaceFingerprint": after["workspaceFingerprint"],
            "candidateSourceManifestSha256": meta.get("candidateSourceManifestSha256"),
            "candidateSourceTreeFingerprint": source_validation["sourceTreeFingerprint"],
            "approvedDiffFingerprint": source_validation["approvedDiffFingerprint"],
            "updatedAt": utc_now(),
            "updatedBy": "workflow-tool",
            "nextAction": "15-freeze-qa-s",
        }
        write_json(pointer_path, pointer)
        persist_state(state, result)
        return {
            "ok": True,
            "command": "sync-final-candidate",
            "idempotent": False,
            "result": result,
            "pointer": pointer,
        }


def set_review_status(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, _ = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    candidate_kind = args.candidate_kind
    candidate_dir = (
        Path(args.candidate_dir).resolve()
        if args.candidate_dir
        else candidate_for_args(
            review_root,
            args.batch_id,
            args.r_id,
            args.fix_id,
            candidate_kind,
        )
    )
    candidate_dir = require_within(
        candidate_dir,
        batch_directory(review_root, args.batch_id),
        "review candidate",
    )
    meta = read_json(candidate_dir / "review-meta.json")
    if meta.get("batchId") != args.batch_id:
        raise WorkflowError("candidate batch id does not match requested batch")
    if candidate_kind == "r-only" and meta.get("candidateType") != "r-only":
        raise WorkflowError("candidate is not an R-only candidate")
    if candidate_kind == "merge" and meta.get("candidateType") != "merge":
        raise WorkflowError("candidate is not a merge candidate")
    require_id(args.review_id, REVIEW_RE, "review id")
    if candidate_kind == "r-only" and not re.fullmatch(r"Review[0-9]+", args.review_id):
        raise WorkflowError("R-only review id must be Review<N>")
    if candidate_kind == "merge" and not re.fullmatch(
        rf"{args.batch_id}-Merge-Review[0-9]+",
        args.review_id,
    ):
        raise WorkflowError("merge review id must be B<N>-Merge-Review<N>")
    if args.status not in {"passed", "failed", "blocked"}:
        raise WorkflowError(f"invalid review status: {args.status}")
    status_path = review_status_path_for_write(candidate_dir, args.review_id)
    evidence_paths = [Path(item).resolve() for item in (args.evidence or [])]
    if args.status == "passed":
        if not evidence_paths:
            raise WorkflowError("a passed review must provide at least one evidence path")
        for evidence in evidence_paths:
            if not evidence.is_file():
                raise WorkflowError(f"review evidence does not exist: {evidence}")
            if not is_within(evidence, candidate_dir / "evidence"):
                raise WorkflowError(
                    f"review evidence must be inside the candidate evidence directory: {evidence}"
                )
    for evidence in evidence_paths:
        if not evidence.is_file():
            raise WorkflowError(f"review evidence does not exist: {evidence}")
    evidence_records = [
        {
            "path": path_string(evidence),
            "sha256": sha256_file(evidence),
            "size": evidence.stat().st_size,
        }
        for evidence in evidence_paths
    ]
    existing = read_json(status_path) if status_path.is_file() else None
    if existing is not None:
        old_status = existing.get("status")
        if old_status != args.status or existing.get("reviewId") != args.review_id:
            raise WorkflowError(
                f"review status is terminal and cannot be overwritten: {old_status}/{existing.get('reviewId')}"
            )
        return {
            "ok": True,
            "command": "set-review-status",
            "idempotent": True,
            "status": existing,
        }
    status = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "review-status",
        "candidateType": meta.get("candidateType"),
        "batchId": args.batch_id,
        "rId": meta.get("rId"),
        "fixId": meta.get("fixId"),
        "reviewId": args.review_id,
        "reviewMode": "B-batch-merge" if candidate_kind == "merge" else "R-only",
        "status": args.status,
        "updatedAt": utc_now(),
        "updatedBy": "GPT",
        "evidence": [path_string(item) for item in evidence_paths],
        "evidenceRecords": evidence_records,
        "candidateFingerprint": meta.get("build", {}).get("treeFingerprint"),
    }
    write_json(status_path, status)
    update_review_meta(
        candidate_dir,
        {
            "reviewStatus": args.status,
            "reviewId": args.review_id,
            "reviewEvidence": status["evidence"],
            "reviewEvidenceRecords": evidence_records,
            "reviewUpdatedAt": status["updatedAt"],
            "nextAction": (
                "15A-sync-final-candidate"
                if args.status == "passed"
                else "return-to-fix-or-review"
            ),
        },
    )
    if candidate_kind == "merge":
        batch_state_path = batch_control(review_root, args.batch_id) / "batch-state.json"
        if batch_state_path.is_file():
            batch_state = read_json(batch_state_path)
            batch_state["mergeReviewStatus"] = args.status
            batch_state["mergeReviewId"] = args.review_id
            batch_state["updatedAt"] = status["updatedAt"]
            batch_state["nextAction"] = "15A-sync-final-candidate" if args.status == "passed" else "append-B-merge-fix-record"
            write_json(batch_state_path, batch_state)
    return {
        "ok": True,
        "command": "set-review-status",
        "idempotent": False,
        "status": status,
    }


def parse_expected_pair(value: str) -> Tuple[str, str]:
    separator = ":" if ":" in value else "=" if "=" in value else None
    if separator is None:
        raise WorkflowError(f"expected R/Fix must use Rn:Fixm: {value}")
    r_id, fix_id = [item.strip() for item in value.split(separator, 1)]
    require_id(r_id, R_RE, "R id")
    require_id(fix_id, FIX_RE, "Fix id")
    return r_id, fix_id


def expected_entries(value: Iterable[str]) -> List[Dict[str, str]]:
    result: List[Dict[str, str]] = []
    seen_r: Set[str] = set()
    seen_pair: Set[Tuple[str, str]] = set()
    for item in value:
        r_id, fix_id = parse_expected_pair(item)
        if r_id in seen_r:
            raise WorkflowError(f"duplicate R in batch input: {r_id}")
        if (r_id, fix_id) in seen_pair:
            raise WorkflowError(f"duplicate R/Fix in batch input: {r_id}:{fix_id}")
        seen_r.add(r_id)
        seen_pair.add((r_id, fix_id))
        result.append({"rId": r_id, "fixId": fix_id, "key": f"{r_id}:{fix_id}"})
    if not result:
        raise WorkflowError("batch must contain at least one expected R/Fix")
    return sorted(result, key=lambda item: int(item["rId"][1:]))


def discover_r_only_directories(batch_dir: Path) -> Tuple[List[Path], List[Path]]:
    if not batch_dir.exists():
        return [], []
    candidates: List[Path] = []
    suspicious: List[Path] = []
    for item in sorted(batch_dir.iterdir()):
        if not item.is_dir() or item.name in {"control", "merge"}:
            continue
        if item.name.startswith("R"):
            if R_ONLY_RE.fullmatch(item.name):
                candidates.append(item)
            else:
                suspicious.append(item)
        else:
            suspicious.append(item)
    return candidates, suspicious


def normalise_excluded_candidate_name(
    value: str,
    batch_dir: Path,
) -> str:
    """Accept one exact R-only directory name, never a wildcard or subtree."""
    raw = str(value).strip()
    if not raw:
        raise WorkflowError("excluded R-only directory name cannot be empty")
    candidate = Path(raw)
    if candidate.is_absolute():
        resolved = candidate.resolve()
        if resolved.parent != batch_dir.resolve():
            raise WorkflowError(
                f"excluded R-only directory must be directly inside {batch_dir}: {value}"
            )
        name = resolved.name
    else:
        normalised = raw.replace("/", "\\")
        if "\\" in normalised:
            raise WorkflowError(
                f"excluded R-only directory must be one exact directory name: {value}"
            )
        name = raw
    if not R_ONLY_RE.fullmatch(name):
        raise WorkflowError(f"invalid excluded R-only directory name: {name}")
    return name


def excluded_candidate_names(
    state: Mapping[str, Any],
    batch_dir: Path,
) -> Set[str]:
    """Read exact exclusions from state and reject malformed/broad entries."""
    values = state.get("excludedROnlyDirectories", [])
    if values is None:
        return set()
    if not isinstance(values, list):
        raise WorkflowError("batch state excludedROnlyDirectories must be a list")
    result: Set[str] = set()
    for value in values:
        if isinstance(value, dict):
            value = value.get("name")
        if not isinstance(value, str):
            raise WorkflowError("batch state contains an invalid excluded R-only directory")
        result.add(normalise_excluded_candidate_name(value, batch_dir))
    return result


def excluded_candidate_reasons(
    state: Mapping[str, Any],
    excluded: Iterable[str],
) -> Dict[str, str]:
    values = state.get("excludedROnlyReasons", {})
    if values is None:
        values = {}
    if not isinstance(values, dict):
        raise WorkflowError("batch state excludedROnlyReasons must be an object")
    return {
        name: str(values.get(name, "explicitly excluded historical/invalid asset"))
        for name in sorted(set(excluded))
    }


def load_batch_state(review_root: Path, batch_id: str) -> Dict[str, Any]:
    path = batch_control(review_root, batch_id) / "batch-state.json"
    return read_json(path)


def finalize_batch(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    entries = expected_entries((args.expected or []) + (args.expected_r_fix or []))
    requested_strategy = args.candidate_strategy or (
        "direct" if len(entries) == 1 else "merge"
    )
    if requested_strategy not in {"direct", "merge"}:
        raise WorkflowError(f"invalid candidate strategy: {requested_strategy}")
    if requested_strategy == "direct" and len(entries) != 1:
        raise WorkflowError("direct candidate strategy requires exactly one expected R/Fix")
    if requested_strategy == "merge" and len(entries) < 2:
        raise WorkflowError("merge candidate strategy requires at least two expected R/Fixes")
    batch_dir = batch_directory(review_root, args.batch_id)
    control_dir = batch_dir / "control"
    control_dir.mkdir(parents=True, exist_ok=True)
    state_path = control_dir / "batch-state.json"
    excluded = {
        normalise_excluded_candidate_name(item, batch_dir)
        for item in (args.exclude_r_only or [])
    }
    expected_names = {
        f"{entry['rId']}-{entry['fixId']}-only"
        for entry in entries
    }
    overlap = sorted(expected_names & excluded)
    if overlap:
        raise WorkflowError(
            "an expected R-only candidate cannot also be excluded: " + ", ".join(overlap)
        )
    reasons = {
        name: (args.exclude_reason or "explicitly excluded historical/invalid asset")
        for name in sorted(excluded)
    }
    with directory_lock(control_dir / ".lock"):
        if state_path.exists():
            existing = read_json(state_path)
            old_entries = existing.get("expectedRFixes")
            if old_entries != entries:
                raise WorkflowError("batch-state.json already exists with a different expected R/Fix set")
            old_strategy = candidate_strategy_from_state(existing)
            if old_strategy != requested_strategy:
                raise WorkflowError(
                    f"batch-state.json already uses candidateStrategy={old_strategy}, requested {requested_strategy}"
                )
            old_excluded = excluded_candidate_names(existing, batch_dir)
            if old_excluded != excluded:
                raise WorkflowError(
                    "batch-state.json already has a different exact excluded R-only set"
                )
            if "candidateStrategy" not in existing or "excludedROnlyDirectories" not in existing:
                existing["candidateStrategy"] = old_strategy
                existing["excludedROnlyDirectories"] = sorted(old_excluded)
                existing.setdefault("excludedROnlyReasons", excluded_candidate_reasons(existing, old_excluded))
                existing.setdefault("snapshotRoot", path_string(snapshot_root))
                existing.setdefault("operationalClosureStatus", "in-progress")
                existing["updatedAt"] = utc_now()
                write_json(state_path, existing)
            return {
                "ok": True,
                "command": "finalize-batch",
                "idempotent": True,
                "state": existing,
            }
        candidates, suspicious = discover_r_only_directories(batch_dir)
        unexpected = [
            item.name
            for item in candidates + suspicious
            if item.name not in expected_names and item.name not in excluded
        ]
        if unexpected:
            raise WorkflowError("batch contains unregistered R directories: " + ", ".join(unexpected))
        base_commit = args.base_commit.strip() if args.base_commit else None
        state = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "r-fix-batch",
            "status": "frozen",
            "batchId": args.batch_id,
            "createdAt": utc_now(),
            "reviewRoot": path_string(review_root),
            "codeRoot": path_string(code_root),
            "snapshotRoot": path_string(snapshot_root),
            "expectedRFixes": entries,
            "expectedRIds": [entry["rId"] for entry in entries],
            "candidateStrategy": requested_strategy,
            "excludedROnlyDirectories": sorted(excluded),
            "excludedROnlyReasons": reasons,
            "baseCommit": base_commit,
            "mergeStatus": "not-prepared",
            "readyToMerge": False,
            "sourceSyncStatus": "not-started",
            "operationalClosureStatus": "in-progress",
            "nextAction": "scan-batch",
        }
        write_json(state_path, state)
        return {
            "ok": True,
            "command": "finalize-batch",
            "idempotent": False,
            "state": state,
        }


def verify_build_record(candidate_dir: Path, meta: Mapping[str, Any], issues: List[Dict[str, Any]]) -> None:
    build = meta.get("build")
    if not isinstance(build, dict):
        issues.append({"code": "missing-build-record", "path": path_string(candidate_dir)})
        return
    app = candidate_dir / "app"
    manifest_path = Path(str(build.get("manifestPath", candidate_dir / "control" / "build-manifest.json")))
    if not app.is_dir() or not manifest_path.is_file():
        issues.append({"code": "missing-build", "path": path_string(candidate_dir)})
        return
    if not is_within(manifest_path, candidate_dir / "control"):
        issues.append({"code": "build-manifest-outside-control", "path": path_string(manifest_path)})
        return
    try:
        actual_manifest = tree_manifest(app)
        actual_payload = manifest_payload(actual_manifest)
        actual_tree = manifest_fingerprint(actual_manifest)
        recorded_payload = read_json(manifest_path)
        if actual_payload != recorded_payload:
            issues.append({"code": "build-manifest-mismatch", "path": path_string(manifest_path)})
        if actual_tree != build.get("treeFingerprint"):
            issues.append({"code": "build-hash-mismatch", "path": path_string(app)})
        if sha256_file(manifest_path) != build.get("manifestSha256"):
            issues.append({"code": "manifest-file-hash-mismatch", "path": path_string(manifest_path)})
    except WorkflowError as exc:
        issues.append({"code": "build-verification-error", "path": path_string(app), "message": str(exc)})


def scan_batch(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, snapshot_root = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    state = load_batch_state(review_root, args.batch_id)
    batch_dir = batch_directory(review_root, args.batch_id)
    expected = state.get("expectedRFixes")
    if not isinstance(expected, list) or not expected:
        raise WorkflowError("batch state has no expected R/Fix set")
    strategy = candidate_strategy_from_state(state)
    if strategy == "direct" and len(expected) != 1:
        raise WorkflowError("batch state direct strategy must contain exactly one expected R/Fix")
    if strategy == "merge" and len(expected) < 2:
        raise WorkflowError("batch state merge strategy must contain at least two expected R/Fixes")
    expected_by_name = {
        f"{item.get('rId')}-{item.get('fixId')}-only": item
        for item in expected
    }
    excluded = excluded_candidate_names(state, batch_dir)
    overlap = sorted(set(expected_by_name) & excluded)
    batch_base = state.get("baseCommit")
    common_baseline_head: Optional[str] = None
    common_baseline_workspace: Optional[str] = None
    common_baseline_tree: Optional[str] = None
    candidates, suspicious = discover_r_only_directories(batch_dir)
    issues: List[Dict[str, Any]] = []
    history_recovery_packages: List[Dict[str, Any]] = []
    if overlap:
        issues.append(
            {
                "code": "excluded-candidate-is-expected",
                "paths": [path_string(batch_dir / name) for name in overlap],
            }
        )
    for name in sorted(excluded):
        excluded_path = batch_dir / name
        if not excluded_path.is_dir():
            issues.append(
                {
                    "code": "excluded-candidate-missing",
                    "path": path_string(excluded_path),
                }
            )
    for item in suspicious:
        if item.name in excluded:
            continue
        issues.append(
            {
                "code": "unregistered-or-malformed-R-directory",
                "path": path_string(item),
            }
        )
    actual_by_r: Dict[str, List[Path]] = {}
    for candidate in candidates:
        if candidate.name in excluded:
            continue
        match = R_ONLY_RE.fullmatch(candidate.name)
        if not match:
            continue
        actual_by_r.setdefault(match.group(1), []).append(candidate)
        if candidate.name not in expected_by_name:
            issues.append({"code": "unregistered-R", "path": path_string(candidate)})
    for r_id, paths in sorted(actual_by_r.items()):
        if len(paths) > 1:
            issues.append(
                {
                    "code": "duplicate-R",
                    "rId": r_id,
                    "paths": [path_string(item) for item in paths],
                }
            )
    for name, item in expected_by_name.items():
        candidate = batch_dir / name
        if not candidate.is_dir():
            issues.append({"code": "missing-R-only", "path": path_string(candidate)})
            continue
        meta_path = candidate / "review-meta.json"
        if not meta_path.is_file():
            issues.append({"code": "missing-review-meta", "path": path_string(candidate)})
            continue
        try:
            meta = read_json(meta_path)
            if meta.get("batchId") != args.batch_id:
                issues.append({"code": "metadata-batch-mismatch", "path": path_string(meta_path)})
            if meta.get("rId") != item.get("rId") or meta.get("fixId") != item.get("fixId"):
                issues.append({"code": "metadata-R-Fix-mismatch", "path": path_string(meta_path)})
            if meta.get("candidateType") != "r-only":
                issues.append({"code": "wrong-candidate-type", "path": path_string(meta_path)})
            if meta.get("status") != "completed":
                issues.append({"code": "candidate-not-completed", "path": path_string(meta_path)})
            if meta.get("restoreStatus") != "verified":
                issues.append({"code": "worktree-not-restored", "path": path_string(meta_path)})
            try:
                begin_meta = load_begin(
                    review_root,
                    args.batch_id,
                    str(meta.get("rId")),
                    str(meta.get("fixId")),
                )
                validate_begin_identity(
                    begin_meta,
                    code_root,
                    snapshot_root,
                    args.batch_id,
                    str(meta.get("rId")),
                    str(meta.get("fixId")),
                )
            except WorkflowError as exc:
                issues.append(
                    {
                        "code": "invalid-begin-fix-state",
                        "path": path_string(meta_path),
                        "message": str(exc),
                    }
                )
            baseline_head = meta.get("baselineHead")
            baseline_workspace = meta.get("baselineWorkspaceFingerprint")
            if not isinstance(baseline_head, str) or not baseline_head:
                issues.append({"code": "baseline-head-missing", "path": path_string(meta_path)})
            if not isinstance(baseline_workspace, str) or not baseline_workspace:
                issues.append({"code": "baseline-workspace-fingerprint-missing", "path": path_string(meta_path)})
            baseline_tree = meta.get("baselineTreeFingerprint")
            if not isinstance(baseline_tree, str) or not baseline_tree:
                issues.append({"code": "baseline-tree-fingerprint-missing", "path": path_string(meta_path)})
            if common_baseline_head is None and isinstance(baseline_head, str) and baseline_head:
                common_baseline_head = baseline_head
            elif baseline_head != common_baseline_head:
                issues.append({"code": "inconsistent-R-baseline-head", "path": path_string(meta_path)})
            if common_baseline_workspace is None and isinstance(baseline_workspace, str) and baseline_workspace:
                common_baseline_workspace = baseline_workspace
            elif baseline_workspace != common_baseline_workspace:
                issues.append({"code": "inconsistent-R-baseline-workspace", "path": path_string(meta_path)})
            if common_baseline_tree is None and isinstance(baseline_tree, str) and baseline_tree:
                common_baseline_tree = baseline_tree
            elif baseline_tree != common_baseline_tree:
                issues.append({"code": "inconsistent-R-baseline", "path": path_string(meta_path)})
            if not isinstance(meta.get("candidateBaseCommit"), str) or meta.get("candidateBaseCommit") != baseline_head:
                issues.append({"code": "candidate-base-mismatch", "path": path_string(meta_path)})
            if batch_base and baseline_head != batch_base:
                issues.append({"code": "candidate-base-mismatch", "path": path_string(meta_path)})
            if meta.get("restoredWorkspaceFingerprint") != meta.get("baselineWorkspaceFingerprint"):
                issues.append({"code": "restore-fingerprint-mismatch", "path": path_string(meta_path)})
            try:
                status, status_path = latest_review_status(candidate)
            except WorkflowError:
                status = None
                status_path = candidate / "control" / "review-status.json"
                issues.append({"code": "missing-review-status", "path": path_string(candidate)})
            if status is not None:
                if not re.fullmatch(r"Review[0-9]+", str(status.get("reviewId", ""))):
                    issues.append({"code": "invalid-R-only-review-id", "path": path_string(status_path)})
                if status.get("status") != "passed":
                    issues.append(
                        {
                            "code": "R-only-review-not-passed",
                            "path": path_string(status_path),
                            "status": status.get("status"),
                        }
                    )
                evidence = status.get("evidence")
                if not isinstance(evidence, list) or not evidence:
                    issues.append({"code": "review-evidence-missing", "path": path_string(status_path)})
                if status.get("status") != meta.get("reviewStatus"):
                    issues.append({"code": "review-meta-status-mismatch", "path": path_string(status_path)})
                evidence_records = status.get("evidenceRecords")
                if not isinstance(evidence_records, list):
                    issues.append({"code": "review-evidence-records-missing", "path": path_string(status_path)})
                    evidence_records = []
                recorded_paths = [str(record.get("path", "")) for record in evidence_records if isinstance(record, dict)]
                if isinstance(evidence, list) and sorted(recorded_paths) != sorted(str(item) for item in evidence):
                    issues.append({"code": "review-evidence-records-mismatch", "path": path_string(status_path)})
                for evidence in evidence or []:
                    evidence_path = Path(str(evidence)).resolve()
                    if not evidence_path.is_file() or not is_within(evidence_path, candidate / "evidence"):
                        issues.append(
                            {
                                "code": "review-evidence-outside-boundary",
                                "path": str(evidence_path),
                            }
                        )
                for record in evidence_records:
                    if not isinstance(record, dict):
                        issues.append({"code": "review-evidence-record-invalid", "path": path_string(status_path)})
                        continue
                    evidence_path = Path(str(record.get("path", ""))).resolve()
                    if evidence_path.is_file():
                        if sha256_file(evidence_path) != record.get("sha256"):
                            issues.append(
                                {
                                    "code": "review-evidence-hash-mismatch",
                                    "path": path_string(evidence_path),
                                }
                            )
            source_manifest_path = Path(
                str(
                    meta.get(
                        "candidateSourceManifestPath",
                        candidate / "control" / "candidate-source-manifest.json",
                    )
                )
            ).resolve()
            if not source_manifest_path.is_file() or not is_within(
                source_manifest_path,
                candidate / "control",
            ):
                issues.append({"code": "candidate-source-manifest-missing", "path": path_string(candidate)})
            else:
                if sha256_file(source_manifest_path) != meta.get("candidateSourceManifestSha256"):
                    issues.append(
                        {
                            "code": "candidate-source-manifest-hash-mismatch",
                            "path": path_string(source_manifest_path),
                        }
                    )
                try:
                    begin_meta = load_begin(
                        review_root,
                        args.batch_id,
                        str(meta.get("rId")),
                        str(meta.get("fixId")),
                    )
                    baseline = parse_manifest_record(begin_meta["baselineManifest"])
                    source = parse_manifest_record(read_json(source_manifest_path))
                    recomputed = changed_paths(baseline, source)
                    declared = sorted(str(item) for item in meta.get("candidateChangedFiles", []))
                    if recomputed != declared:
                        issues.append(
                            {
                                "code": "candidate-source-diff-mismatch",
                                "path": path_string(source_manifest_path),
                            }
                        )
                    if set(recomputed) - set(meta.get("allowedSourceFiles", [])):
                        issues.append(
                            {
                                "code": "candidate-source-outside-allowlist",
                                "path": path_string(source_manifest_path),
                            }
                        )
                    if meta.get("approvedDiffFingerprint") != approved_diff_fingerprint(
                        changed_entries(baseline, source)
                    ):
                        issues.append(
                            {
                                "code": "candidate-diff-fingerprint-mismatch",
                                "path": path_string(source_manifest_path),
                            }
                        )
                except WorkflowError as exc:
                    issues.append(
                        {
                            "code": "candidate-source-verification-error",
                            "path": path_string(source_manifest_path),
                            "message": str(exc),
                        }
                    )
            verify_build_record(candidate, meta, issues)
            if not (candidate / "userData").is_dir() or not (candidate / "evidence").is_dir():
                issues.append({"code": "isolation-directories-missing", "path": path_string(candidate)})
            source_tree_value = meta.get(
                "candidateSourceTreePath",
                candidate / "control" / "source-tree",
            )
            source_tree = Path(str(source_tree_value)).resolve()
            diff_value = meta.get(
                "approvedSourceDiffPath",
                candidate / "control" / "approved-source-diff.json",
            )
            diff_path = Path(str(diff_value)).resolve()
            legacy_recovery_required = (
                not meta.get("candidateSourceTreePath")
                and not source_tree.is_dir()
                and not meta.get("approvedSourceDiffPath")
                and not meta.get("approvedSourceDiffSha256")
                and not diff_path.is_file()
            )
            if legacy_recovery_required:
                try:
                    recovery_baseline, _, _ = candidate_baseline_manifest(
                        review_root,
                        args.batch_id,
                        candidate,
                        meta,
                    )
                    recovery_source, _ = candidate_source_manifest(candidate, meta)
                    recovery, recovered_tree, _ = verified_history_source_recovery(
                        snapshot_root,
                        args.batch_id,
                        candidate,
                        meta,
                        recovery_baseline,
                        recovery_source,
                    )
                    history_recovery_packages.append(
                        {
                            "candidateDir": path_string(candidate),
                            "sourceRecoveryStatus": recovery.get("sourceRecoveryStatus"),
                            "historySourceRecoveryResultPath": path_string(
                                history_source_recovery_directory(
                                    snapshot_root,
                                    args.batch_id,
                                    candidate,
                                )
                                / "control"
                                / "history-source-recovery-result.json"
                            ),
                            "sourceTreePath": path_string(recovered_tree),
                            "sourceTreeFingerprint": recovery.get("sourceTreeFingerprint"),
                            "approvedDiffFingerprint": recovery.get("approvedDiffFingerprint"),
                        }
                    )
                except WorkflowError as exc:
                    issues.append(
                        {
                            "code": "history-source-recovery-verification-error",
                            "path": path_string(
                                history_source_recovery_directory(
                                    snapshot_root,
                                    args.batch_id,
                                    candidate,
                                )
                            ),
                            "message": str(exc),
                        }
                    )
            else:
                if not source_tree.is_dir() or not is_within(source_tree, candidate / "control"):
                    issues.append(
                        {
                            "code": "candidate-source-tree-missing",
                            "path": path_string(source_tree),
                        }
                    )
                else:
                    try:
                        source_tree_manifest = tree_manifest(source_tree)
                        source_manifest = parse_manifest_record(read_json(source_manifest_path))
                        if not manifest_content_equal(source_tree_manifest, source_manifest):
                            issues.append(
                                {
                                    "code": "candidate-source-tree-mismatch",
                                    "path": path_string(source_tree),
                                }
                            )
                        if meta.get("candidateSourceTreeFingerprint") != manifest_fingerprint(source_manifest):
                            issues.append(
                                {
                                    "code": "candidate-source-tree-fingerprint-mismatch",
                                    "path": path_string(source_manifest_path),
                                }
                            )
                        if not source_package_is_readonly(source_tree):
                            issues.append(
                                {
                                    "code": "candidate-source-tree-not-readonly",
                                    "path": path_string(source_tree),
                                }
                            )
                    except WorkflowError as exc:
                        issues.append(
                            {
                                "code": "candidate-source-tree-verification-error",
                                "path": path_string(source_tree),
                                "message": str(exc),
                            }
                        )
                if not diff_path.is_file() or not is_within(diff_path, candidate / "control"):
                    issues.append(
                        {
                            "code": "candidate-source-diff-missing",
                            "path": path_string(diff_path),
                        }
                    )
                elif meta.get("approvedSourceDiffSha256") and sha256_file(diff_path) != meta.get("approvedSourceDiffSha256"):
                    issues.append(
                        {
                            "code": "candidate-source-diff-hash-mismatch",
                            "path": path_string(diff_path),
                        }
                    )
            launcher_value = meta.get("reviewLauncher")
            launcher = Path(str(launcher_value)).resolve() if launcher_value else candidate / "missing-launcher"
            if not launcher.is_file() or not is_within(launcher, candidate):
                issues.append({"code": "review-launcher-missing", "path": path_string(candidate)})
        except WorkflowError as exc:
            issues.append({"code": "invalid-candidate-metadata", "path": path_string(meta_path), "message": str(exc)})
    missing = [
        name
        for name in expected_by_name
        if not (batch_dir / name).is_dir()
    ]
    ready = not issues and not missing
    ready_to_merge = ready and strategy == "merge"
    ready_to_final_sync = ready and strategy == "direct"
    if ready_to_final_sync:
        status = "ready-for-final-sync"
        next_action = "15A-sync-final-candidate"
    elif ready_to_merge:
        status = "ready-for-merge"
        next_action = "prepare-merge"
    else:
        status = "blocked-or-pending"
        next_action = "complete-missing-or-failed-R-reviews"
    scan = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "r-fix-batch-scan",
        "batchId": args.batch_id,
        "scannedAt": utc_now(),
        "codeRoot": path_string(code_root),
        "expectedRFixes": expected,
        "candidateStrategy": strategy,
        "discoveredROnlyDirectories": [path_string(item) for item in candidates],
        "excludedROnlyDirectories": sorted(excluded),
        "excludedROnlyReasons": excluded_candidate_reasons(state, excluded),
        "historySourceRecoveryPackages": history_recovery_packages,
        "issues": issues,
        "missing": missing,
        "readyToMerge": ready_to_merge,
        "readyToFinalSync": ready_to_final_sync,
        "status": status,
        "nextAction": next_action,
    }
    control_dir = batch_control(review_root, args.batch_id)
    write_json(control_dir / "batch-scan.json", scan)
    if strategy == "direct":
        updated_state = dict(state)
        updated_state["readyToFinalSync"] = ready_to_final_sync
        updated_state["nextAction"] = next_action
        updated_state["updatedAt"] = scan["scannedAt"]
        write_json(control_dir / "batch-state.json", updated_state)
    return {
        "ok": True,
        "command": "scan-batch",
        "readyToMerge": ready_to_merge,
        "readyToFinalSync": ready_to_final_sync,
        "scan": scan,
    }


def watch_batch(args: argparse.Namespace) -> Dict[str, Any]:
    interval = max(0.0, float(args.interval_seconds))
    timeout = max(0.0, float(args.timeout_seconds))
    started = time.monotonic()
    while True:
        result = scan_batch(args)
        scan = result["scan"]
        hard_codes = {
            "unregistered-or-malformed-R-directory",
            "unregistered-R",
            "duplicate-R",
            "metadata-batch-mismatch",
            "metadata-R-Fix-mismatch",
            "wrong-candidate-type",
            "candidate-not-completed",
            "invalid-begin-fix-state",
            "candidate-base-mismatch",
            "baseline-head-missing",
            "baseline-workspace-fingerprint-missing",
            "baseline-tree-fingerprint-missing",
            "inconsistent-R-baseline-head",
            "inconsistent-R-baseline-workspace",
            "inconsistent-R-baseline",
            "worktree-not-restored",
            "restore-fingerprint-mismatch",
            "review-meta-status-mismatch",
            "review-evidence-records-missing",
            "review-evidence-records-mismatch",
            "review-evidence-record-invalid",
            "review-evidence-outside-boundary",
            "review-evidence-hash-mismatch",
            "invalid-R-only-review-id",
            "candidate-source-manifest-missing",
            "candidate-source-manifest-hash-mismatch",
            "candidate-source-tree-missing",
            "candidate-source-tree-mismatch",
            "candidate-source-tree-fingerprint-mismatch",
            "candidate-source-tree-not-readonly",
            "candidate-source-diff-missing",
            "candidate-source-diff-hash-mismatch",
            "candidate-source-diff-mismatch",
            "candidate-source-outside-allowlist",
            "candidate-diff-fingerprint-mismatch",
            "build-manifest-mismatch",
            "build-hash-mismatch",
            "manifest-file-hash-mismatch",
            "review-launcher-missing",
            "R-only-review-not-passed",
            "excluded-candidate-missing",
            "excluded-candidate-is-expected",
        }
        if scan["readyToMerge"] or any(item.get("code") in hard_codes for item in scan["issues"]):
            return {
                "ok": True,
                "command": "watch-batch",
                "readyToMerge": scan["readyToMerge"],
                "timedOut": False,
                "scan": scan,
            }
        if time.monotonic() - started >= timeout:
            return {
                "ok": True,
                "command": "watch-batch",
                "readyToMerge": False,
                "timedOut": True,
                "scan": scan,
            }
        time.sleep(interval)


def batch_candidate_meta(
    batch_dir: Path,
    item: Mapping[str, Any],
) -> Dict[str, Any]:
    candidate = batch_dir / f"{item['rId']}-{item['fixId']}-only"
    return read_json(candidate / "review-meta.json")


def approved_union(
    batch_dir: Path,
    expected: Sequence[Mapping[str, Any]],
) -> Tuple[Set[str], Dict[str, List[Dict[str, Any]]], str]:
    union: Set[str] = set()
    records: Dict[str, List[Dict[str, Any]]] = {}
    base_commit: Optional[str] = None
    for item in expected:
        meta = batch_candidate_meta(batch_dir, item)
        if meta.get("candidateType") != "r-only":
            raise WorkflowError(f"not an R-only candidate: {item}")
        if meta.get("restoreStatus") != "verified":
            raise WorkflowError(f"R-only candidate was not restored: {item}")
        candidate = batch_dir / f"{item['rId']}-{item['fixId']}-only"
        status, _ = latest_review_status(candidate)
        if status.get("status") != "passed":
            raise WorkflowError(f"R-only review is not passed: {item}")
        candidate_base = meta.get("candidateBaseCommit")
        if not candidate_base:
            raise WorkflowError(f"R-only candidate has no base commit: {item}")
        if base_commit is None:
            base_commit = str(candidate_base)
        elif base_commit != str(candidate_base):
            raise WorkflowError("R-only candidates do not share one base commit")
        for path in meta.get("candidateChangedFiles", []):
            union.add(path)
            records.setdefault(path, []).append(
                {
                    "rId": item["rId"],
                    "fixId": item["fixId"],
                    "candidate": path_string(
                        batch_dir / f"{item['rId']}-{item['fixId']}-only"
                    ),
                }
            )
    if base_commit is None:
        raise WorkflowError("batch has no R-only base commit")
    return union, records, base_commit


def prepare_merge(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, _ = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    state = load_batch_state(review_root, args.batch_id)
    if candidate_strategy_from_state(state) != "merge":
        raise WorkflowError("prepare-merge is only valid for a multi-R batch with candidateStrategy=merge")
    scan = scan_batch(args)
    if not scan["readyToMerge"]:
        raise WorkflowError("merge is blocked until every registered R-only review passes")
    expected = state["expectedRFixes"]
    union, records, base_commit = approved_union(batch_directory(review_root, args.batch_id), expected)
    declared_base = state.get("baseCommit")
    if declared_base and declared_base != base_commit:
        raise WorkflowError("batch baseCommit does not match R-only candidate base commits")
    if not declared_base:
        state["baseCommit"] = base_commit
    handoff = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "r-fix-merge-handoff",
        "batchId": args.batch_id,
        "createdAt": utc_now(),
        "codeRoot": path_string(code_root),
        "baseCommit": base_commit,
        "expectedRFixes": expected,
        "approvedChangedFiles": sorted(union),
        "approvedChangedFileSources": records,
        "rOnlyReviewIds": [
            read_json(
                batch_directory(review_root, args.batch_id)
                / f"{item['rId']}-{item['fixId']}-only"
                / "control"
                / "review-status.json"
            ).get("reviewId")
            for item in expected
        ],
        "status": "ready-for-ds-integration",
        "nextAction": "DS integrates and calls complete-merge",
    }
    path = batch_control(review_root, args.batch_id) / "merge-ready.json"
    if path.is_file():
        existing = read_json(path)
        if existing.get("approvedChangedFiles") != handoff["approvedChangedFiles"]:
            raise WorkflowError("merge-ready.json exists with a different approved file set")
        state["readyToMerge"] = True
        state["mergeStatus"] = "ready-for-ds-integration"
        state["updatedAt"] = utc_now()
        state["nextAction"] = "DS-complete-merge"
        write_json(batch_control(review_root, args.batch_id) / "batch-state.json", state)
        return {
            "ok": True,
            "command": "prepare-merge",
            "idempotent": True,
            "handoff": existing,
        }
    write_json(path, handoff)
    state["readyToMerge"] = True
    state["mergeStatus"] = "ready-for-ds-integration"
    state["updatedAt"] = utc_now()
    state["nextAction"] = "DS-complete-merge"
    write_json(batch_control(review_root, args.batch_id) / "batch-state.json", state)
    return {
        "ok": True,
        "command": "prepare-merge",
        "idempotent": False,
        "handoff": handoff,
    }


def integration_changed_state(code_root: Path, baseline: Mapping[str, Any]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    current = capture_code_state(code_root)
    current_manifest = parse_manifest_record(current["manifest"])
    baseline_manifest = parse_manifest_record(baseline["baselineManifest"])
    changed = changed_entries(baseline_manifest, current_manifest)
    return current_manifest, {
        "state": current,
        "baselineManifest": baseline_manifest,
        "changed": changed,
    }


def complete_merge(args: argparse.Namespace) -> Dict[str, Any]:
    _, code_root, review_root, _ = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    build_dir = Path(args.build_dir).resolve()
    if not build_dir.is_dir():
        raise WorkflowError(f"build directory does not exist: {build_dir}")
    batch_dir = batch_directory(review_root, args.batch_id)
    state = load_batch_state(review_root, args.batch_id)
    if candidate_strategy_from_state(state) != "merge":
        raise WorkflowError("complete-merge is only valid for a multi-R batch with candidateStrategy=merge")
    handoff_path = batch_control(review_root, args.batch_id) / "merge-ready.json"
    handoff = read_json(handoff_path)
    scan = scan_batch(args)
    if not scan["readyToMerge"]:
        raise WorkflowError("merge is blocked until every registered R-only review passes")
    merge_dir = batch_dir / "merge"
    if merge_dir.exists():
        meta_path = merge_dir / "review-meta.json"
        if meta_path.is_file():
            existing = read_json(meta_path)
            if (
                existing.get("status") == "completed"
                and existing.get("restoreStatus") == "not-applicable-after-merge"
                and existing.get("developmentWorktreePreserved") is True
            ):
                return {
                    "ok": True,
                    "command": "complete-merge",
                    "idempotent": True,
                    "candidate": existing,
                }
        raise WorkflowError(f"merge directory already exists and is not a completed identical run: {merge_dir}")
    if handoff.get("batchId") != args.batch_id or handoff.get("status") != "ready-for-ds-integration":
        raise WorkflowError("merge-ready.json is not an actionable handoff for this batch")
    if handoff.get("expectedRFixes") != state.get("expectedRFixes"):
        raise WorkflowError("merge-ready.json expected R/Fix set does not match batch-state.json")
    expected_base = str(handoff.get("baseCommit", ""))
    current_head = git_head(code_root)
    if current_head != expected_base:
        raise WorkflowError(f"integration base commit does not match batch base: {current_head} != {expected_base}")
    first_begin = load_begin(
        review_root,
        args.batch_id,
        state["expectedRFixes"][0]["rId"],
        state["expectedRFixes"][0]["fixId"],
    )
    current_manifest, integration = integration_changed_state(code_root, first_begin)
    changed = integration["changed"]
    approved = set(handoff.get("approvedChangedFiles", []))
    unknown = sorted(set(changed) - approved)
    missing = sorted(approved - set(changed))
    if unknown:
        raise WorkflowError("integration contains files outside the approved R-only union: " + ", ".join(unknown))
    if missing:
        raise WorkflowError("integration is missing approved R-only changes: " + ", ".join(missing))
    union, records, _ = approved_union(batch_dir, state["expectedRFixes"])
    if approved != union:
        raise WorkflowError("merge-ready.json approved file set does not match the R-only union")
    resolution = parse_allowed(args.merge_resolution_file or [], code_root, "merge resolution file")
    unexpected_resolution = sorted(resolution - union)
    if unexpected_resolution:
        raise WorkflowError(
            "merge resolution names files outside the approved R-only union: "
            + ", ".join(unexpected_resolution)
        )
    for path in sorted(union):
        owners = records.get(path, [])
        if len(owners) == 1:
            source_candidate = Path(owners[0]["candidate"]) / "control" / "candidate-source-manifest.json"
            source_payload = read_json(source_candidate)
            source_map = parse_manifest_record(source_payload)
            current_record = current_manifest.get(path)
            if current_record != source_map.get(path):
                raise WorkflowError(
                    f"integration changed a non-overlapping approved file beyond its R-only candidate: {path}"
                )
        elif path not in resolution:
            raise WorkflowError(
                f"overlapping file requires explicit --merge-resolution-file: {path}"
            )
        else:
            candidate_records = []
            for owner in owners:
                source_candidate = Path(owner["candidate"]) / "control" / "candidate-source-manifest.json"
                source_map = parse_manifest_record(read_json(source_candidate))
                candidate_records.append(source_map.get(path))
            if current_manifest.get(path) not in candidate_records:
                raise WorkflowError(
                    f"merge resolution does not match an approved R-only candidate: {path}"
                )

    merge_control = merge_dir / "control"
    merge_evidence = merge_dir / "evidence"
    merge_userdata = merge_dir / "userData"
    merge_dir.mkdir(parents=True, exist_ok=False)
    merge_control.mkdir()
    merge_evidence.mkdir()
    merge_userdata.mkdir()
    try:
        merge_source_artifacts = write_candidate_source_artifacts(
            merge_control,
            code_root,
            current_manifest,
            integration["baselineManifest"],
            {
                "batchId": args.batch_id,
                "candidateType": "merge",
                "baseCommit": expected_base,
                "approvedChangedFiles": sorted(approved),
                "baselineIndexEntries": first_begin.get("baselineIndexEntries", []),
                "candidateIndexEntries": integration["state"].get("indexEntries", []),
                "syncBaseIndexEntries": integration["state"].get("indexEntries", []),
            },
        )
        copy_tree(build_dir, merge_dir / "app")
        build = build_record(merge_dir / "app", merge_control)
        launch_command = launch_command_value(args.launch_command)
        launcher = merge_dir / f"启动合并复审-{args.batch_id}.bat"
        write_text(
            launcher,
            "\r\n".join(
                [
                    "@echo off",
                    "setlocal",
                    'set "ROOT=%~dp0"',
                    'set "USER_DATA=%ROOT%userData"',
                    'if not exist "%USER_DATA%" mkdir "%USER_DATA%"',
                    f'echo Launch command: {launch_command}',
                    f'if exist "%ROOT%{launch_command}" start "" "%ROOT%{launch_command}" --user-data-dir="%USER_DATA%"',
                    f'if not exist "%ROOT%{launch_command}" echo Missing launch target: %ROOT%{launch_command}',
                    "endlocal",
                    "",
                ]
            ),
        )
        meta = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": "r-fix-review-candidate",
            "status": "completed",
            "candidateType": "merge",
            "batchId": args.batch_id,
            "createdAt": utc_now(),
            "codeRoot": path_string(code_root),
            "candidateDir": path_string(merge_dir),
            "appDir": path_string(merge_dir / "app"),
            "userDataDir": path_string(merge_userdata),
            "evidenceDir": path_string(merge_evidence),
            "reviewLauncher": path_string(launcher),
            "launchCommand": launch_command,
            "baseCommit": expected_base,
            "integrationHead": current_head,
            "integrationWorkspaceFingerprint": integration["state"]["workspaceFingerprint"],
            "integrationTreeFingerprint": integration["state"]["treeFingerprint"],
            "approvedChangedFiles": sorted(approved),
            "approvedChangedFileSources": records,
            "resolutionFiles": sorted(resolution),
            "candidateSourceManifestPath": merge_source_artifacts["sourceManifestPath"],
            "candidateSourceManifestSha256": merge_source_artifacts["sourceManifestSha256"],
            "candidateSourceTreePath": merge_source_artifacts["sourceTreePath"],
            "candidateSourceTreeFingerprint": merge_source_artifacts["sourceTreeFingerprint"],
            "approvedSourceDiffPath": merge_source_artifacts["approvedSourceDiffPath"],
            "approvedSourceDiffSha256": merge_source_artifacts["approvedSourceDiffSha256"],
            "approvedDiffFingerprint": merge_source_artifacts["approvedDiffFingerprint"],
            "rOnlyReviewIds": handoff.get("rOnlyReviewIds", []),
            "build": build,
            "reviewStatus": "not-reviewed",
            "restoreStatus": "not-applicable-after-merge",
            "developmentWorktreePreserved": True,
            "nextAction": "05-batch-merge-review",
        }
        write_json(merge_dir / "review-meta.json", meta)
        write_json(
            merge_control / "merge-complete.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "kind": "r-fix-merge-complete",
                "createdAt": utc_now(),
                "batchId": args.batch_id,
                "candidate": path_string(merge_dir),
                "baseCommit": expected_base,
                "approvedChangedFiles": sorted(approved),
                "developmentWorktreePreserved": True,
                "nextAction": "05-batch-merge-review",
            },
        )
    except Exception:
        remove_tree(merge_dir)
        raise
    state["mergeStatus"] = "candidate-ready-for-review"
    state["readyToMerge"] = False
    state["updatedAt"] = utc_now()
    state["nextAction"] = "05-batch-merge-review"
    write_json(batch_control(review_root, args.batch_id) / "batch-state.json", state)
    return {
        "ok": True,
        "command": "complete-merge",
        "idempotent": False,
        "candidate": meta,
    }


def merge_document_target(
    workspace: Path,
    batch_id: str,
    document: Optional[str],
    version_feature: Optional[str],
) -> Path:
    if document:
        target = Path(document).resolve()
        require_within(target, workspace / "用户实测阶段", "merge document")
    elif version_feature:
        feature_path = Path(version_feature)
        if feature_path.is_absolute():
            feature_path = feature_path.resolve()
            require_within(feature_path, workspace / "用户实测阶段", "version-feature directory")
        else:
            feature_path = workspace / "用户实测阶段" / feature_path
        target = feature_path / "\u5408\u5e76\u590d\u5ba1" / f"{batch_id}-merge\u7684\u5168\u6d41\u7a0b\u95ed\u73af.md"
    else:
        raise WorkflowError("create-merge-document requires --document or --version-feature")
    return target


def create_merge_document(args: argparse.Namespace) -> Dict[str, Any]:
    workspace, _, review_root, _ = resolve_paths(args)
    require_id(args.batch_id, BATCH_RE, "batch id")
    batch_dir = batch_directory(review_root, args.batch_id)
    merge_meta = read_json(batch_dir / "merge" / "review-meta.json")
    if merge_meta.get("candidateType") != "merge":
        raise WorkflowError("merge candidate metadata is not a merge candidate")
    target = merge_document_target(
        workspace,
        args.batch_id,
        args.document,
        args.version_feature,
    )
    expected_name = f"{args.batch_id}-merge\u7684\u5168\u6d41\u7a0b\u95ed\u73af.md"
    if target.name != expected_name:
        raise WorkflowError(f"merge document must use the unique name: {expected_name}")
    if target.parent.name != "\u5408\u5e76\u590d\u5ba1":
        raise WorkflowError("merge document must be inside the merge review directory")
    parent = target.parent
    parent.mkdir(parents=True, exist_ok=True)
    prefix = f"{args.batch_id}-merge\u7684\u5168\u6d41\u7a0b\u95ed\u73af"
    duplicates = [
        item
        for item in parent.glob(prefix + "*.md")
        if item.resolve() != target.resolve()
    ]
    if duplicates:
        raise WorkflowError(
            "more than one merge closure document exists: "
            + ", ".join(path_string(item) for item in duplicates)
        )
    marker = f"<!-- r-fix-review-batch: {args.batch_id} -->"
    if target.exists():
        content = target.read_text(encoding="utf-8")
        if marker not in content:
            raise WorkflowError(f"existing merge document is not bound to {args.batch_id}: {target}")
        return {
            "ok": True,
            "command": "create-merge-document",
            "created": False,
            "document": path_string(target),
            "candidate": merge_meta,
        }
    generated = "\n".join(
        [
            marker,
            f"# {args.batch_id} merge closure",
            "",
            "This document is the single authoritative closure record for the batch merge review.",
            "GPT must append the full evidence-backed review record here through Prompt 13/05.",
            "",
            "## Machine handoff",
            "",
            f"- batchId: {args.batch_id}",
            f"- candidateType: {merge_meta.get('candidateType')}",
            f"- candidateDir: {merge_meta.get('candidateDir')}",
            f"- appDir: {merge_meta.get('appDir')}",
            f"- userDataDir: {merge_meta.get('userDataDir')}",
            f"- evidenceDir: {merge_meta.get('evidenceDir')}",
            f"- reviewLauncher: {merge_meta.get('reviewLauncher')}",
            f"- baseCommit: {merge_meta.get('baseCommit')}",
            f"- integrationWorkspaceFingerprint: {merge_meta.get('integrationWorkspaceFingerprint')}",
            f"- integrationTreeFingerprint: {merge_meta.get('integrationTreeFingerprint')}",
            f"- buildTreeFingerprint: {merge_meta.get('build', {}).get('treeFingerprint')}",
            f"- rOnlyReviewIds: {json.dumps(merge_meta.get('rOnlyReviewIds', []), ensure_ascii=False)}",
            "- reviewStatus: not-reviewed",
            "- nextAction: GPT uses Prompt 05 for the batch merge review",
            "",
            "## Review append-only boundary",
            "",
            "Do not overwrite prior facts, R closure records, user feedback, test plans, or build state.",
            "The final merge review must identify every R-only candidate, integration evidence, isolation boundary,",
            "review evidence, remaining scope, and the next QA/S decision.",
            "",
        ]
    )
    write_text(target, generated)
    return {
        "ok": True,
        "command": "create-merge-document",
        "created": True,
        "document": path_string(target),
        "candidate": merge_meta,
    }


def add_roots(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--workspace-root", help="documentation and code workspace root")
    parser.add_argument("--code-root", help="product development directory")
    parser.add_argument("--review-root", help="review candidate root")
    parser.add_argument("--snapshot-root", help="baseline snapshot root")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="R Fix review candidate and multi-R merge workflow"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    baseline = subparsers.add_parser(
        "register-development-baseline",
        help="explicitly register a C0 or history-migration development baseline",
    )
    add_roots(baseline)
    baseline.add_argument(
        "--registration-kind",
        choices=["c0", "history-migration"],
        default="c0",
    )
    baseline.add_argument("--reason", default="")

    begin = subparsers.add_parser("begin-fix", help="capture the exact pre-Fix worktree")
    add_roots(begin)
    begin.add_argument("--batch-id", required=True)
    begin.add_argument("--r-id", required=True)
    begin.add_argument("--fix-id", required=True)

    complete = subparsers.add_parser("complete-fix", help="build an R-only candidate and restore the worktree")
    add_roots(complete)
    complete.add_argument("--batch-id", required=True)
    complete.add_argument("--r-id", required=True)
    complete.add_argument("--fix-id", required=True)
    complete.add_argument("--build-dir", required=True)
    complete.add_argument("--candidate-source")
    complete.add_argument("--candidate-base-commit", default="")
    complete.add_argument("--allowed-source-file", action="append", default=[])
    complete.add_argument("--allowed-worktree-file", action="append", default=[])
    complete.add_argument("--launch-command", default="")

    status = subparsers.add_parser("set-review-status", help="record a terminal GPT review status")
    add_roots(status)
    status.add_argument("--batch-id", required=True)
    status.add_argument("--candidate-kind", choices=["r-only", "merge"], default="r-only")
    status.add_argument("--candidate-dir")
    status.add_argument("--r-id")
    status.add_argument("--fix-id")
    status.add_argument("--review-id", required=True)
    status.add_argument("--status", choices=["passed", "failed", "blocked"], required=True)
    status.add_argument("--evidence", action="append", default=[])

    finalize = subparsers.add_parser("finalize-batch", help="freeze the expected R/Fix set")
    add_roots(finalize)
    finalize.add_argument("--batch-id", required=True)
    finalize.add_argument("--expected", action="append", default=[])
    finalize.add_argument("--expected-r-fix", action="append", default=[])
    finalize.add_argument("--base-commit", default="")
    finalize.add_argument(
        "--candidate-strategy",
        choices=["direct", "merge"],
        default="",
        help="direct for one R; merge for a multi-R batch",
    )
    finalize.add_argument(
        "--exclude-r-only",
        "--excluded-r-only",
        "--exclude-candidate",
        dest="exclude_r_only",
        action="append",
        default=[],
        help="register one exact historical/invalid R-only directory to exclude",
    )
    finalize.add_argument(
        "--exclude-reason",
        default="",
        help="reason recorded for every exact excluded R-only directory",
    )

    scan = subparsers.add_parser("scan-batch", help="dynamically scan all R-only candidates")
    add_roots(scan)
    scan.add_argument("--batch-id", required=True)

    watch = subparsers.add_parser("watch-batch", help="wait for the batch scan to become merge-ready")
    add_roots(watch)
    watch.add_argument("--batch-id", required=True)
    watch.add_argument("--interval-seconds", type=float, default=5.0)
    watch.add_argument("--timeout-seconds", type=float, default=300.0)

    prepare = subparsers.add_parser("prepare-merge", help="create the DS integration handoff after all R reviews pass")
    add_roots(prepare)
    prepare.add_argument("--batch-id", required=True)

    merge = subparsers.add_parser("complete-merge", help="copy the integrated build without restoring the worktree")
    add_roots(merge)
    merge.add_argument("--batch-id", required=True)
    merge.add_argument("--build-dir", required=True)
    merge.add_argument("--merge-resolution-file", action="append", default=[])
    merge.add_argument("--launch-command", default="")

    document = subparsers.add_parser("create-merge-document", help="create or validate the unique GPT merge closure document")
    add_roots(document)
    document.add_argument("--batch-id", required=True)
    document.add_argument("--document")
    document.add_argument("--version-feature")

    sync = subparsers.add_parser(
        "sync-final-candidate",
        help="save and synchronise the final B candidate source after Review passes",
    )
    add_roots(sync)
    sync.add_argument("--batch-id", required=True)
    sync.add_argument("--candidate-strategy", choices=["direct", "merge"], required=True)
    sync.add_argument("--candidate-dir", required=True)
    sync.add_argument("--review-status", required=True)
    sync.add_argument(
        "--source-payload-dir",
        help="audited legacy source payload used only when candidate source-tree is absent",
    )

    recovery = subparsers.add_parser(
        "recover-history-source-package",
        help="verify and preserve a complete source tree for a historical candidate",
    )
    add_roots(recovery)
    recovery.add_argument("--batch-id", required=True)
    recovery.add_argument("--candidate-dir", required=True)
    recovery.add_argument("--source-dir", required=True)
    recovery.add_argument(
        "--required-source-file",
        action="append",
        default=[],
        help="source file that must be present; repeat for each historical required file",
    )
    recovery.add_argument(
        "--source-evidence",
        action="append",
        default=[],
        help="auditable reconstruction evidence file; repeat to record each source",
    )
    recovery.add_argument(
        "--reconstruction-note",
        action="append",
        default=[],
        help="bounded reconstruction detail such as an audited tool-call range",
    )

    return parser


def dispatch(args: argparse.Namespace) -> Dict[str, Any]:
    if args.command == "register-development-baseline":
        return register_development_baseline(args)
    if args.command == "begin-fix":
        return begin_fix(args)
    if args.command == "complete-fix":
        return complete_fix(args)
    if args.command == "set-review-status":
        return set_review_status(args)
    if args.command == "finalize-batch":
        return finalize_batch(args)
    if args.command == "scan-batch":
        return scan_batch(args)
    if args.command == "watch-batch":
        return watch_batch(args)
    if args.command == "prepare-merge":
        return prepare_merge(args)
    if args.command == "complete-merge":
        return complete_merge(args)
    if args.command == "create-merge-document":
        return create_merge_document(args)
    if args.command == "sync-final-candidate":
        return sync_final_candidate(args)
    if args.command == "recover-history-source-package":
        return recover_history_source_package(args)
    raise WorkflowError(f"unknown command: {args.command}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = dispatch(args)
    except WorkflowError as exc:
        failure = (
            record_sync_gate_failure(args, exc)
            if args.command == "sync-final-candidate"
            else None
        )
        print(
            json.dumps(
                {
                    "ok": False,
                    "command": getattr(args, "command", None),
                    "error": str(exc),
                    **({"result": failure} if failure is not None else {}),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2
    except Exception as exc:
        failure = (
            record_sync_gate_failure(args, exc)
            if args.command == "sync-final-candidate"
            else None
        )
        print(
            json.dumps(
                {
                    "ok": False,
                    "command": getattr(args, "command", None),
                    "error": str(exc),
                    **({"result": failure} if failure is not None else {}),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.command == "watch-batch" and (
        result.get("timedOut") or not result.get("readyToMerge")
    ):
        return 3
    if args.command == "sync-final-candidate" and not result.get("ok"):
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
