"""Check the published Markdown package; no executor or model calls."""

from pathlib import Path
import re


root = Path(__file__).resolve().parents[1]
package = root / "skills" / "delegate-kit"
assert {p.relative_to(package).as_posix() for p in package.rglob("*") if p.is_file()} == {
    "SKILL.md", "team.md", "team.example.md", "gpt-team.md", "quality.md"
}, "Unexpected files in the instruction and team package"
assert list((root / "skills").rglob("SKILL.md")) == [package / "SKILL.md"]

text = (package / "SKILL.md").read_text()
header = re.fullmatch(r"---\n(.*?)\n---\n(.+)", text, re.S)
assert header, "Missing frontmatter or body"
# This package deliberately uses only single-line plain YAML scalar fields.
fields = dict(line.split(": ", 1) for line in header[1].splitlines())
assert set(fields) == {"name", "description", "license"}
assert fields["name"] == package.name
assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", fields["name"])
assert len(fields["name"]) <= 64
assert 0 < len(fields["description"]) <= 1024
assert all(": " not in value and " #" not in value for value in fields.values())

for path in [root / "README.md", *package.glob("*.md"), root / "docs" / "verification.md"]:
    body = path.read_text()
    links = re.findall(r"\]\(([^)]+)\)", body)
    links += re.findall(r'(?:src|srcset)="([^"]+)"', body)
    for link in links:
        if re.match(r"[a-z]+://", link) or link.startswith("#"):
            continue
        target = (path.parent / link.split("#", 1)[0]).resolve()
        assert target.exists(), f"Broken local link in {path.relative_to(root)}: {link}"

for path in sorted(package.glob("*.md")):
    print(f"{path.name}: {len(path.read_text().split())} words, {path.stat().st_size} bytes")
print("Package layout, metadata and local links passed")
