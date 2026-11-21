#!/usr/bin/env python3
"""Checks the ChatGPT plugin package against OpenAI's submission limits.

Run from anywhere: python3 check.py. Exits 1 on any failure; warnings do not fail.
Limits from developers.openai.com/plugins/deploy/submission (read 2026-11-17).
"""
import json, re, struct, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER_URL = "https://mcp.light-cloud.com/chatgpt"
ZIP_NAME = "light-cloud-chatgpt-plugin.zip"
ZIP_FILES = {"plugin.json", "mcp.json", "assets/logo.png"}
fails, warns = [], []


def check(ok, msg):
    if not ok:
        fails.append(msg)


def limit(label, text, maximum):
    n = len(text)
    print(f"  {label:<44} {n:>5} / {maximum}  {'ok' if n <= maximum else 'OVER'}")
    check(0 < n <= maximum, f"{label}: {n} characters, limit {maximum}")


def load(name):
    try:
        return json.loads((HERE / name).read_text(encoding="utf-8"))
    except Exception as e:  # report and stop: nothing else can be checked
        sys.exit(f"FAIL {name} does not parse: {e}")


plugin, mcp = load("plugin.json"), load("mcp.json")
print("JSON: plugin.json and mcp.json parse")

# -- plugin.json root (agent-plugins.org 1.0.0 plugin.schema.json) --
check(plugin.get("$schema") == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "plugin.json $schema")
check(set(plugin) <= {"$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"}, "plugin.json has keys outside the schema")
check(re.fullmatch(r"(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", plugin.get("name", "")) is not None, "name pattern")
check(re.fullmatch(r"\d+\.\d+\.\d+", plugin.get("version", "")) is not None, "version is not semver")
check(set(plugin.get("author", {})) <= {"name", "email", "url"}, "author has keys outside the schema")

openai = plugin["extensions"]["com.openai"]
ui, review, publication = openai["interface"], openai.get("review", {}), openai.get("publication", {})

# -- mcp.json: exactly one remote server, no headers, no secrets --
check(mcp.get("$schema") == "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "mcp.json $schema")
check(set(mcp) == {"$schema", "mcpServers"}, "mcp.json root keys")
servers = mcp.get("mcpServers", {})
check(len(servers) == 1, f"mcp.json declares {len(servers)} servers, needs exactly 1")
for name, s in servers.items():
    check(s.get("type") == "streamable-http", f"server {name}: type must be streamable-http")
    check(s.get("url") == SERVER_URL, f"server {name}: url must be {SERVER_URL}")
    check(not s.get("headers"), f"server {name}: headers must be empty")
    check(set(s) <= {"type", "url", "headers", "extensions"}, f"server {name}: unexpected keys")
    if "extensions" in s:
        # OpenAI's build guide puts auth here; the published agent-plugins 1.0.0 schema does not list it
        warns.append(f"server {name}: 'extensions' (OpenAI auth) is not in agent-plugins.org mcp.schema.json 1.0.0; drop it if upload rejects it")
        auth = s["extensions"].get("com.openai", {}).get("auth", {})
        check(auth.get("type") == "oauth", f"server {name}: auth.type should be oauth")
        check("clientId" not in auth.get("client", {}), f"server {name}: no clientId with cimd/dcr")

# keys OpenAI rejects or that block submission, anywhere in either file
def keys(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield k
            yield from keys(v)
    elif isinstance(o, list):
        for v in o:
            yield from keys(v)
banned_keys = {"test_credentials", "reviewer_instructions", "apps", "hooks", "clientSecret", "client_secret"}
found = banned_keys & set(keys(plugin)) | banned_keys & set(keys(mcp))
check(not found, f"keys OpenAI rejects: {sorted(found)}")

# -- listing limits --
print("Character limits:")
limit("name", plugin["name"], 64)
limit("description (package)", plugin["description"], 4000)
limit("author.name", plugin["author"]["name"], 120)
limit("displayName", ui["displayName"], 30)
limit("shortDescription", ui["shortDescription"], 30)
limit("longDescription", ui["longDescription"], 4000)
limit("developerName", ui["developerName"], 80)
check(bool(ui.get("category")), "category missing")
caps = ui.get("capabilities", [])
check(len(caps) <= 20, f"{len(caps)} capabilities, limit 20")
for i, c in enumerate(caps, 1):
    limit(f"capabilities[{i}]", c, 120)
prompts = ui.get("defaultPrompt", [])
check(len(prompts) <= 3 and len(set(prompts)) == len(prompts), "defaultPrompt: at most 3, unique")
for i, p in enumerate(prompts, 1):
    limit(f"defaultPrompt[{i}]", p, 128)
    check("@" not in p, f"defaultPrompt[{i}] has an @mention")
for f in ("websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"):
    limit(f, ui[f], 1024)
    check(ui[f].startswith("https://") and "@" not in ui[f], f"{f} must be HTTPS without credentials")
check(not re.search(r"\b(mcp|plugin)\b", ui["displayName"], re.I), "displayName must not append MCP or Plugin")

# words OpenAI rejects in listing text (pricing, trials, comparisons, superlatives) and AI-cliche words
listing = " ".join([plugin["description"], ui["shortDescription"], ui["longDescription"], *caps, *prompts, publication.get("release_notes", "")])
banned = r"free|trial|pricing|price|prices|discount|promo\w*|cheap\w*|best|fastest|easiest|#1|leading|better than|unlike|vercel|netlify|heroku|render|seamless\w*|effortless\w*|powerful|unlock\w*|leverag\w*|streamlin\w*|robust|cutting-edge|supercharg\w*|elevat\w*|delv\w*|game-chang\w*|revolution\w*|instantly|magic\w*"
hits = sorted({m.group(0).lower() for m in re.finditer(rf"\b(?:{banned})\b", listing, re.I)})
check(not hits, f"listing text has words OpenAI or house style rejects: {hits}")

# -- icons --
for f in ("logo", "composerIcon"):
    rel = ui.get(f, "")
    check(rel.startswith("./"), f"{f} path must start with ./")
    p = HERE / rel
    if not p.is_file():
        fails.append(f"{f}: {rel} missing")
        continue
    head = p.read_bytes()[:24]
    check(head[:8] == b"\x89PNG\r\n\x1a\n", f"{f}: not a PNG")
    w, h = struct.unpack(">II", head[16:24])
    size = p.stat().st_size
    print(f"  {f:<44} {w}x{h} px, {size} bytes")
    check(w == h and 48 <= w <= 4096 and size <= 5 * 1024 * 1024, f"{f}: must be square, 48-4096 px, at most 5 MiB")

# -- review cases --
cases = review.get("test_cases", {})
pos, neg = cases.get("positive", []), cases.get("negative", [])
check(len(pos) == 5, f"{len(pos)} positive cases, need exactly 5")
check(len(neg) == 3, f"{len(neg)} negative cases, need exactly 3")
src = (HERE / "../../src/index.ts").read_text(encoding="utf-8")
chatgpt_tools = set(re.findall(r'"([a-z-]+)"', src.split("export const CHATGPT_TOOLS = new Set([", 1)[1].split("]);", 1)[0]))
print(f"Review: {len(pos)} positive, {len(neg)} negative; CHATGPT_TOOLS has {len(chatgpt_tools)} tools")
for kind, items, need in (("positive", pos, ("description", "prompt", "tools_triggered", "expected_behavior")), ("negative", neg, ("description", "prompt"))):
    for i, c in enumerate(items, 1):
        for k in need:
            check(bool(c.get(k, "").strip()), f"{kind}[{i}] missing {k}")
        limit(f"{kind}[{i}].description", c["description"], 4000)
        for t in filter(None, (t.strip() for t in c.get("tools_triggered", "").split(","))):
            check(t in chatgpt_tools, f"{kind}[{i}] names {t}, which is not in CHATGPT_TOOLS")
demo = review.get("demo_recording_url", "")
if not demo.startswith("https://"):
    warns.append(f"demo_recording_url is a placeholder ({demo!r}): replace it before submitting")
check(bool(publication.get("release_notes")), "release_notes missing")

# -- the built ZIP, if present, must hold exactly the current package files --
z = HERE / ZIP_NAME
if z.exists():
    with zipfile.ZipFile(z) as zf:
        names = {n for n in zf.namelist() if not n.endswith("/")}
        check(names == ZIP_FILES, f"{ZIP_NAME} holds {sorted(names)}, expected {sorted(ZIP_FILES)}")
        stale = [n for n in names & ZIP_FILES if zf.read(n) != (HERE / n).read_bytes()]
        check(not stale, f"{ZIP_NAME} is stale for {stale}: rebuild it")
    print(f"ZIP: {ZIP_NAME} checked")
else:
    warns.append(f"{ZIP_NAME} not built yet")

for w in warns:
    print("WARN", w)
for f in fails:
    print("FAIL", f)
print("OK" if not fails else f"{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
