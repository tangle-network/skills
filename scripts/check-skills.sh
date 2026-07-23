#!/usr/bin/env bash
# Validate every marketplace plugin and skill, then run bundled check scripts.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python3 -S - <<'PY'
import json
import re
from pathlib import Path

root = Path.cwd()
errors: list[str] = []
max_skill_bytes = 20_000
max_skill_description_chars = 96

marketplace_path = root / '.claude-plugin' / 'marketplace.json'
try:
    marketplace = json.loads(marketplace_path.read_text())
except Exception as exc:
    print(f'FAIL: cannot read {marketplace_path}: {exc}')
    raise SystemExit(1)

entries = marketplace.get('plugins')
if not isinstance(entries, list):
    print('FAIL: marketplace plugins must be an array')
    raise SystemExit(1)

entry_by_name: dict[str, dict] = {}
primary_descriptions: dict[str, str] = {}
for index, entry in enumerate(entries):
    name = entry.get('name') if isinstance(entry, dict) else None
    if not isinstance(name, str) or not name:
        errors.append(f'marketplace plugins[{index}] has no name')
        continue
    if name in entry_by_name:
        errors.append(f'marketplace duplicates plugin {name!r}')
    entry_by_name[name] = entry

plugin_dirs = sorted(
    path for path in (root / 'plugins').iterdir()
    if path.is_dir() and (path / '.claude-plugin' / 'plugin.json').is_file()
)
plugin_names = {path.name for path in plugin_dirs}

for name in sorted(plugin_names - set(entry_by_name)):
    errors.append(f'plugins/{name}: missing marketplace entry')
for name in sorted(set(entry_by_name) - plugin_names):
    errors.append(f'marketplace entry {name!r}: plugin directory is missing')

frontmatter_re = re.compile(r'^---\n(.*?)\n---\n', re.DOTALL)
link_re = re.compile(r'\[[^\]]+\]\(([^)]+)\)')

for plugin_dir in plugin_dirs:
    manifest_path = plugin_dir / '.claude-plugin' / 'plugin.json'
    try:
        manifest = json.loads(manifest_path.read_text())
    except Exception as exc:
        errors.append(f'{manifest_path}: invalid JSON: {exc}')
        continue

    if manifest.get('name') != plugin_dir.name:
        errors.append(
            f'{manifest_path}: name {manifest.get("name")!r} does not match {plugin_dir.name!r}'
        )

    entry = entry_by_name.get(plugin_dir.name)
    if entry:
        expected_source = f'./plugins/{plugin_dir.name}'
        if entry.get('source') != expected_source:
            errors.append(
                f'{marketplace_path}: {plugin_dir.name} source must be {expected_source!r}'
            )
        manifest_version = manifest.get('version')
        if manifest_version and manifest_version != entry.get('version'):
            errors.append(
                f'{manifest_path}: version {manifest_version!r} does not match '
                f'marketplace {entry.get("version")!r}'
            )

    skill_root = plugin_dir / 'skills'
    skill_dirs = sorted(
        path for path in skill_root.iterdir()
        if path.is_dir() and (path / 'SKILL.md').is_file()
    ) if skill_root.is_dir() else []
    if not skill_dirs:
        errors.append(f'{plugin_dir}: contains no skills/*/SKILL.md')

    for skill_dir in skill_dirs:
        skill_md = skill_dir / 'SKILL.md'
        content = skill_md.read_text(errors='replace').replace('\r\n', '\n')
        line_count = len(content.splitlines())
        byte_count = len(content.encode())
        if line_count >= 500:
            errors.append(f'{skill_md}: {line_count} lines; SKILL.md must be <500')
        if byte_count > max_skill_bytes:
            errors.append(
                f'{skill_md}: {byte_count} bytes; SKILL.md must be <= {max_skill_bytes}'
            )

        match = frontmatter_re.match(content)
        if not match:
            errors.append(f'{skill_md}: missing or malformed YAML frontmatter')
        else:
            names = re.findall(r'^name:\s*["\']?([^"\'\n]+)', match.group(1), re.MULTILINE)
            frontmatter_lines = match.group(1).splitlines()
            description = ''
            for index, line in enumerate(frontmatter_lines):
                if not line.startswith('description:'):
                    continue
                raw_description = line.removeprefix('description:').strip()
                if raw_description in {'>', '>-', '|', '|-'}:
                    parts = []
                    for next_line in frontmatter_lines[index + 1:]:
                        if next_line and not next_line[0].isspace():
                            break
                        if next_line.strip():
                            parts.append(next_line.strip())
                    description = ' '.join(parts)
                else:
                    description = raw_description.strip(' "\'')
                break
            if names != [skill_dir.name]:
                errors.append(
                    f'{skill_md}: frontmatter name must be exactly {skill_dir.name!r}'
                )
            if not description:
                errors.append(f'{skill_md}: description must be non-empty')
            elif len(description) > max_skill_description_chars:
                errors.append(
                    f'{skill_md}: description has {len(description)} chars; '
                    f'must be <= {max_skill_description_chars}'
                )
            elif skill_dir.name == plugin_dir.name:
                primary_descriptions[plugin_dir.name] = description

        for raw_link in link_re.findall(content):
            link = raw_link.strip()
            if link.startswith(('http://', 'https://', 'mailto:', '#')):
                continue
            target = link.split('#', 1)[0]
            if not target:
                continue
            resolved = (skill_dir / target).resolve()
            if not resolved.exists():
                errors.append(f'{skill_md}: broken relative link {link!r}')

    expected_description = primary_descriptions.get(plugin_dir.name)
    if expected_description is None:
        errors.append(
            f'{plugin_dir}: missing primary skills/{plugin_dir.name}/SKILL.md'
        )
    else:
        if manifest.get('description') != expected_description:
            errors.append(
                f'{manifest_path}: description must match the primary skill'
            )
        if entry and entry.get('description') != expected_description:
            errors.append(
                f'{marketplace_path}: {plugin_dir.name} description must match '
                'the primary skill'
            )

if errors:
    print(f'FAIL: {len(errors)} issue(s)')
    for error in errors:
        print(f'  - {error}')
    raise SystemExit(1)

skill_count = sum(
    1 for _ in (root / 'plugins').glob('*/skills/*/SKILL.md')
)
print(f'OK: {len(plugin_dirs)} plugins and {skill_count} skills validated')
PY

if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$repo_root"
else
  echo "WARN: claude not found; skipped plugin manifest validator" >&2
fi

if [ "${SKIP_PACKAGE_CHECKS:-0}" != "1" ]; then
  while IFS= read -r check_script; do
    echo "Running ${check_script#./}"
    bash "$check_script"
  done < <(find ./plugins -path '*/skills/*/scripts/check-*.sh' -type f | sort)
fi
