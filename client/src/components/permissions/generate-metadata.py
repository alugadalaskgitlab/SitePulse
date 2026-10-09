"""Reproducible DISPLAY-ONLY Phase 1 projection. Never imports server source.

Run from the workspace root. Raw handlers, JSX, calls and guard expressions are
deliberately excluded. Provenance row numbers refer to data rows (header = 0).
"""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path("reports/user-perm-redesign01")
OUT = Path("client/src/components/permissions/inventory.generated.json")


def rows(name):
    return list(csv.DictReader((ROOT / name).open()))


def human(value):
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value).replace("_", " ")


def safe_label(value, fallback):
    # Preserve plain display labels; dynamic JSX cannot safely be evaluated.
    if not value or any(c in value for c in "{}<>`"):
        return fallback, True
    return re.sub(r"[\U0001f000-\U0001ffff\u2600-\u27bf]", "", value[:160]), False


hierarchy = rows("hierarchical-function-matrix.csv")
controls = rows("frontend-controls.csv")
operations = rows("function-action-matrix.csv")
tiles = rows("hub-tiles.csv")
pages = rows("page-reachability.csv")
functions = {}
route_records = []

for i, row in enumerate(hierarchy):
    file = row["component"]
    fid = Path(file).stem
    sections = [x.strip() for x in row["current_keys"].split(";") if x.strip()]
    label = row["tile_module"].split(" / ")[0]
    if label == fid:
        label = human(fid)
    node = functions.setdefault(fid, {
        "id": fid, "label": label, "file": file, "locations": [],
        "sections": [], "routes": [], "controls": [], "operations": [],
        "classification": "function",
    })
    location = [row["hub"], label]
    if location not in node["locations"]:
        node["locations"].append(location)
    node["sections"] = sorted(set(node["sections"] + sections))
    node["routes"].append([row["route"], row["source"], i + 1])
    route_records.append([row["route"], fid, i + 1])
    for name in row["available_operations"].split(" | "):
        if name and name not in node["operations"]:
            node["operations"].append(name)

for row in pages:
    fid = Path(row["file"]).stem
    if fid not in functions:
        functions[fid] = {
            "id": fid, "label": human(fid), "file": row["file"],
            "locations": [["Embedded & legacy", "Embedded pages" if row["importReachable"] == "true" else "Unreachable legacy source"]],
            "sections": [], "routes": [], "controls": [], "operations": [],
            "classification": "embedded" if row["importReachable"] == "true" else "legacy-unreachable",
        }

control_records = []
for i, row in enumerate(controls):
    fid = Path(row["file"]).stem
    if fid not in functions:
        functions[fid] = {
            "id": fid, "label": human(fid), "file": row["file"],
            "locations": [["Embedded & shared", "Supporting components"]],
            "sections": [], "routes": [], "controls": [], "operations": [],
            "classification": "embedded",
        }
    label, dynamic = safe_label(row["label"], "Dynamic " + row["tag"])
    # Static tab/choice values are useful when the visible label is dynamic.
    value, dynamic_value = safe_label(row["value"], "")
    if dynamic and value and not dynamic_value:
        label = human(value)
    control_records.append([label, row["tag"], row["source"], dynamic, i + 1])
    functions[fid]["controls"].append(i)

operation_records = []
for i, row in enumerate(operations):
    cells = sorted(set(re.findall(
        r"\b([a-z_]+)\.(view_reports|view|create|edit|delete|export|approve|notify)\b",
        row["permissionEvidence"])))
    refs = sorted(set(re.findall(r"(?:server|client|shared)/[\w/.-]+:\d+", row["permissionEvidence"])))
    checks = row["backendChecks"]
    privileged = bool(re.search(r"assertAdmin|assertOwner|req\.isOwner|req\.isAdmin|isOwner|isAdmin", checks))
    classification = "privileged/conditional" if privileged else "observed-permission" if cells else "auth/legacy/unresolved"
    operation_records.append([
        row["operation"], row["source"], cells, classification, refs,
        "No direct literal caller" if "No direct literal" in row["frontendCallers"] else "Candidate callers only",
        i + 1,
    ])
    caller_files = set(re.findall(r"client/src/[\w/.-]+\.(?:tsx|ts)", row["frontendCallers"]))
    matched = False
    for node in functions.values():
        if row["operation"] in node["operations"] or node["file"] in caller_files:
            if row["operation"] not in node["operations"]:
                node["operations"].append(row["operation"])
            if node["classification"] != "legacy-unreachable":
                matched = True
    if not matched:
        op_id = f"api:{i + 1}"
        functions[op_id] = {
            "id": op_id, "label": row["operation"], "file": row["source"].split(":")[0],
            "locations": [["API-only & unresolved", classification]],
            "sections": sorted(set(c[0] for c in cells)),
            "routes": [], "controls": [], "operations": [row["operation"]],
            "classification": "api-only",
        }

tile_records = []
for i, row in enumerate(tiles):
    title, _ = safe_label(row["title"], "Conditional tile")
    # Template query values affect presentation, not canonical function identity.
    literal = re.search(r"/[A-Za-z0-9_/:.-]+", row["href"])
    href = literal.group(0) if literal else ""
    matches = sorted(set(fid for route, fid, _ in route_records
                         if re.fullmatch(re.sub(r":[A-Za-z_]+", r"[^/]+", route), href)))
    if row["title"] == "Road Works DPR" and row["href"] == "{roadDprHref(HUB)}":
        # Read-only current helper tracing: dprEntryMode.ts:75-80.
        href = "/site/guided | /site/new"
        matches = sorted(set(fid for route, fid, _ in route_records if route in ["/site/guided", "/site/new"]))
    tile_records.append([title, href, row["source"], matches, i + 1])
    # Cross-hub entry points reference the SAME function ID.
    hub = {
        "HmpHub": "HMP", "SiteHub": "Site Operations", "EquipmentHub": "Equipment & Fleet",
        "ReportsHub": "Reports / originating domain", "FinanceHub": "Procurement & Billing",
        "StoresHub": "Stores & Inventory", "RmcHub": "RMC", "MastersHub": "Administration",
        "AdminMastersHub": "Masters", "EstimatorHub": "Estimator", "DprWorkHub": "Site Operations",
        "SiteHome": "Site Operations",
    }.get(Path(row["file"]).stem, human(Path(row["file"]).stem))
    for fid in matches:
        location = [hub, title]
        if location not in functions[fid]["locations"]:
            functions[fid]["locations"].append(location)

system_records = []
for inventory, kind in [("background-actions.csv", "background"), ("notification-actions.csv", "notification")]:
    for i, row in enumerate(rows(inventory)):
        # Only expose callee names, NEVER arguments, message bodies or raw calls.
        names = re.findall(r"\b(?:storage\.)?([A-Za-z][A-Za-z0-9_]*)\s*\(", row["call"])
        name = next((n for n in names if n.startswith(("ensure", "sendPush", "createNotification", "init", "backfill", "rebuild"))),
                    names[0] if names else "System operation")
        system_records.append([human(name), kind, row["source"], inventory, i + 1])

for kind, title in [("background", "Background & maintenance"), ("notification", "Notification plumbing")]:
    fid = "system:" + kind
    functions[fid] = {
        "id": fid, "label": title, "file": "", "locations": [["System", title]],
        "sections": [], "routes": [], "controls": [], "operations": [],
        "classification": "system",
    }

evidence = rows("permission-evidence.csv")
for row in evidence:
    fid = "legacy:" + row["section_key"]
    if fid not in functions:
        functions[fid] = {
            "id": fid, "label": row["section_label"], "file": "shared/permissions.ts",
            "locations": [["Stored permission library", "Compatibility & persisted bits"]],
            "sections": [row["section_key"]], "routes": [], "controls": [], "operations": [],
            "classification": "stored-bits",
        }
cell_records = [[r["section_key"], r["action_key"], r["ui_state"],
                 sorted(set(re.findall(r"(?:server|client|shared)/[\w/.-]+:\d+", r["frontend_evidence"] + " " + r["backend_evidence"]))),
                 i + 1] for i, r in enumerate(evidence)]
source_names = ["hierarchical-function-matrix.csv", "function-action-matrix.csv", "frontend-controls.csv",
                "page-reachability.csv", "hub-tiles.csv", "permission-evidence.csv",
                "background-actions.csv", "notification-actions.csv", "navigation-routes.csv",
                "navigation-configurations.csv", "navigation-links.csv", "frontend-api-calls.csv"]
navigation = []
for i, row in enumerate(rows("navigation-configurations.csv")):
    label, dynamic = safe_label(row["label"].strip('"'), "Dynamic navigation label")
    match = re.search(r"/[A-Za-z0-9_/:.-]*", row["destination"])
    navigation.append([label, match.group(0) if match else "", row["source"], i + 1])
links = []
for i, row in enumerate(rows("navigation-links.csv")):
    label, dynamic = safe_label(row["label"], "Dynamic link")
    match = re.search(r"/[A-Za-z0-9_/:.-]+", row["href"])
    links.append([label, match.group(0) if match else "", row["source"], i + 1])
api_calls = [[r["source"], r["name"] if re.fullmatch(r"[A-Za-z_$][\w.$]*", r["name"]) else "Dynamic/shared helper", i + 1]
             for i, r in enumerate(rows("frontend-api-calls.csv"))]
data = {
    "provenance": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_names},
    "counts": {"routes": len(hierarchy), "pages": len(pages), "tiles": len(tiles),
               "controls": len(controls), "operations": len(operations), "cells": len(evidence),
               "background": 106, "notifications": 191,
               "dynamicControls": sum(c[3] for c in control_records),
               "navigationConfigurations": len(navigation), "navigationLinks": len(links),
               "frontendApiCalls": len(api_calls),
               "apiOnly": sum(f["classification"] == "api-only" for f in functions.values())},
    "functions": list(functions.values()), "controls": control_records, "operations": operation_records,
    "tiles": tile_records, "routes": route_records, "systems": system_records, "cells": cell_records,
    "navigation": navigation, "links": links, "apiCalls": api_calls,
}
OUT.write_text(json.dumps(data, ensure_ascii=True, separators=(",", ":")) + "\n")
print(json.dumps(data["counts"]))
print(f"{len(functions)} canonical nodes; {OUT.stat().st_size} bytes; no handler/JSX bodies")
