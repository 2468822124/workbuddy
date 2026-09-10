#!/usr/bin/env python3
"""Rebuild the audited B2/R1-Fix2 source tree from its begin snapshot.

This is deliberately candidate-specific.  It replays only the frozen Claude
Edit/Write calls listed below and accepts the result only when every file
matches candidate-source-manifest.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


EXPECTED_OPERATIONS = [
    (1983, "Edit", "call_00_9tbJlJfCNWQn7v4QlTge8885", "src/shared/flowTypes.ts"),
    (2021, "Edit", "call_00_MXni9TzikVLjxLtL919z1143", "src/main/services/flowDerived.ts"),
    (2050, "Edit", "call_00_ET_VOVRR0HCy70VdwZVXihV8913", "src/main/services/flowDerived.ts"),
    (2072, "Edit", "call_00_ET_Uvno0ucuSzo8hsTXgEau8571", "src/main/services/flowDerived.ts"),
    (2093, "Edit", "call_00_bUD2rYi3jpSNYeoQ7p3o5438", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2113, "Edit", "call_00_ET_2pivmAQCleerkd5G7t6W6319", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2133, "Edit", "call_00_ET_dqNcgOYG4vEmxmcVHVD35518", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2153, "Edit", "call_00_ET_AF5ytcN3LZq3H9mymKMO7766", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2174, "Edit", "call_00_ET_aXIBRfjOhBpf3OFjqZIO8863", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2195, "Edit", "call_00_ET_rUdRI2RbGdcMU5vgqd6B6279", "src/renderer/src/components/flow/InstanceRow.vue"),
    (2216, "Edit", "call_00_mNEqnfZfmqPmuR3Rhlhi3768", "src/renderer/src/components/flow/InstanceList.vue"),
    (2236, "Edit", "call_00_ET_9wwJbaDnrbtQ4CUekMqr8114", "src/renderer/src/components/flow/InstanceList.vue"),
    (2256, "Edit", "call_00_ET_D3ow0fguyRENIfvu8jqi6953", "src/renderer/src/views/flow/FlowWeekView.vue"),
    (2277, "Edit", "call_00_ET_OBKXvxNhmgnEw2lQr3782261", "src/renderer/src/views/flow/FlowWeekView.vue"),
    (2354, "Write", "call_00_xrkbu5jywgDBJvQamkDy3941", "tests/r1Fix2.spec.ts"),
    (2375, "Edit", "call_00_oU60NvGN37dECtQFJTX80984", "tests/r1Fix2.spec.ts"),
    (2395, "Edit", "call_00_ET_DcjXTBcnIQQUVEDkLeJi9434", "tests/r1Fix2.spec.ts"),
]


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, dict[str, object]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    files = value.get("files")
    if not isinstance(files, list):
        raise RuntimeError(f"manifest has no files list: {path}")
    result: dict[str, dict[str, object]] = {}
    for record in files:
        relative = record.get("path")
        if not isinstance(relative, str) or relative in result:
            raise RuntimeError(f"invalid or duplicate manifest path: {relative!r}")
        result[relative.replace("\\", "/")] = dict(record)
    return result


def transcript_operations(path: Path) -> tuple[list[dict[str, object]], set[str]]:
    selected: list[dict[str, object]] = []
    successful_results: set[str] = set()
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, 1):
            value = json.loads(raw)
            message = value.get("message")
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "tool_result" and not item.get("is_error"):
                    tool_id = item.get("tool_use_id")
                    if isinstance(tool_id, str):
                        successful_results.add(tool_id)
                if (
                    1983 <= line_number <= 2395
                    and item.get("type") == "tool_use"
                    and item.get("name") in {"Edit", "Write"}
                ):
                    selected.append(
                        {
                            "line": line_number,
                            "name": item["name"],
                            "id": item.get("id"),
                            "input": item.get("input"),
                        }
                    )
    return selected, successful_results


def normalise_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def safe_target(root: Path, relative: str) -> Path:
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise RuntimeError(f"unsafe relative path: {relative}")
    target = (root / relative_path).resolve()
    if root.resolve() not in target.parents:
        raise RuntimeError(f"target escapes output root: {relative}")
    return target


def choose_frozen_serialisation(text: str, expected_sha256: str, relative: str) -> bytes:
    normalised = normalise_newlines(text)
    variants = {
        "LF": normalised.encode("utf-8"),
        "CRLF": normalised.replace("\n", "\r\n").encode("utf-8"),
    }
    matches = [name for name, value in variants.items() if sha256_bytes(value) == expected_sha256]
    if len(matches) != 1:
        raise RuntimeError(
            f"replayed text for {relative} has {len(matches)} matching newline serialisations"
        )
    return variants[matches[0]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--candidate-manifest", required=True)
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--audit-output", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    baseline_dir = Path(args.baseline_dir).resolve()
    candidate_manifest_path = Path(args.candidate_manifest).resolve()
    transcript_path = Path(args.transcript).resolve()
    output_dir = Path(args.output_dir).resolve()
    audit_output = Path(args.audit_output).resolve()
    if output_dir.exists():
        raise RuntimeError(f"refusing to overwrite recovery output: {output_dir}")
    if audit_output.exists():
        raise RuntimeError(f"refusing to overwrite recovery audit: {audit_output}")

    baseline_manifest_path = baseline_dir / "manifest.json"
    baseline = load_manifest(baseline_manifest_path)
    candidate = load_manifest(candidate_manifest_path)
    operations, successful_results = transcript_operations(transcript_path)

    observed = []
    for operation in operations:
        tool_input = operation.get("input")
        if not isinstance(tool_input, dict):
            raise RuntimeError(f"tool call has invalid input: {operation.get('id')}")
        file_path = Path(str(tool_input.get("file_path", ""))).resolve()
        try:
            relative = file_path.relative_to(Path(r"E:\workspace\workbuddy").resolve()).as_posix()
        except ValueError as exc:
            raise RuntimeError(f"tool call is outside WorkBuddy: {file_path}") from exc
        observed.append((operation["line"], operation["name"], operation["id"], relative))
    if observed != EXPECTED_OPERATIONS:
        raise RuntimeError("transcript Edit/Write operation sequence does not match the frozen allowlist")
    missing_results = [tool_id for _, _, tool_id, _ in EXPECTED_OPERATIONS if tool_id not in successful_results]
    if missing_results:
        raise RuntimeError("transcript lacks successful tool results: " + ", ".join(missing_results))

    output_dir.mkdir(parents=True, exist_ok=False)
    for relative in sorted(baseline):
        source = safe_target(baseline_dir, relative)
        target = safe_target(output_dir, relative)
        if not source.is_file():
            raise RuntimeError(f"baseline source file is missing: {source}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    text_by_path: dict[str, str] = {}
    operation_audit = []
    for operation, expected in zip(operations, EXPECTED_OPERATIONS):
        line_number, name, tool_id, relative = expected
        tool_input = operation["input"]
        assert isinstance(tool_input, dict)
        target = safe_target(output_dir, relative)
        if name == "Write":
            content = tool_input.get("content")
            if not isinstance(content, str):
                raise RuntimeError(f"Write content is not text: {tool_id}")
            text_by_path[relative] = normalise_newlines(content)
            replacements = 1
        else:
            old = tool_input.get("old_string")
            new = tool_input.get("new_string")
            replace_all = bool(tool_input.get("replace_all", False))
            if not isinstance(old, str) or not isinstance(new, str) or not old:
                raise RuntimeError(f"Edit strings are invalid: {tool_id}")
            if relative not in text_by_path:
                text_by_path[relative] = normalise_newlines(target.read_bytes().decode("utf-8"))
            current = text_by_path[relative]
            old = normalise_newlines(old)
            new = normalise_newlines(new)
            count = current.count(old)
            if count == 0 or (not replace_all and count != 1):
                raise RuntimeError(f"Edit match count is {count} for {tool_id}")
            text_by_path[relative] = current.replace(old, new, -1 if replace_all else 1)
            replacements = count if replace_all else 1
        operation_audit.append(
            {
                "line": line_number,
                "tool": name,
                "toolUseId": tool_id,
                "path": relative,
                "replacementCount": replacements,
            }
        )

    for relative, text_value in sorted(text_by_path.items()):
        expected = candidate.get(relative)
        if not expected or not isinstance(expected.get("sha256"), str):
            raise RuntimeError(f"touched file is absent from candidate manifest: {relative}")
        target = safe_target(output_dir, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(
            choose_frozen_serialisation(text_value, str(expected["sha256"]), relative)
        )

    actual_paths = {
        path.relative_to(output_dir).as_posix()
        for path in output_dir.rglob("*")
        if path.is_file()
    }
    if actual_paths != set(candidate):
        missing = sorted(set(candidate) - actual_paths)
        extra = sorted(actual_paths - set(candidate))
        raise RuntimeError(f"recovered tree path mismatch; missing={missing}, extra={extra}")
    mismatches = []
    for relative, record in candidate.items():
        path = safe_target(output_dir, relative)
        if sha256_file(path) != record.get("sha256") or path.stat().st_size != record.get("size"):
            mismatches.append(relative)
    if mismatches:
        raise RuntimeError("recovered tree hash mismatch: " + ", ".join(mismatches))

    changed = sorted(
        relative
        for relative in set(baseline) | set(candidate)
        if baseline.get(relative, {}).get("sha256") != candidate.get(relative, {}).get("sha256")
        or baseline.get(relative, {}).get("size") != candidate.get(relative, {}).get("size")
    )
    audit = {
        "schemaVersion": 1,
        "kind": "B2-R1-Fix2-source-reconstruction-audit",
        "baselineDir": str(baseline_dir),
        "baselineManifestPath": str(baseline_manifest_path),
        "baselineManifestSha256": sha256_file(baseline_manifest_path),
        "candidateManifestPath": str(candidate_manifest_path),
        "candidateManifestSha256": sha256_file(candidate_manifest_path),
        "transcriptPath": str(transcript_path),
        "transcriptSha256": sha256_file(transcript_path),
        "transcriptLineRange": "1983-2395",
        "operationCount": len(operation_audit),
        "operations": operation_audit,
        "changedFiles": changed,
        "candidateFileCount": len(candidate),
        "verification": "all candidate paths, SHA-256 hashes, and sizes matched",
        "outputDir": str(output_dir),
    }
    audit_output.parent.mkdir(parents=True, exist_ok=True)
    audit_output.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(audit, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
