# Inlines src/core.js into src/index.src.html -> index.html (single-file, no build tooling needed to host)
from pathlib import Path
root = Path(__file__).parent
core = (root / "src/core.js").read_text().replace('if (typeof module !== "undefined") module.exports = HL;', "")
html = (root / "src/index.src.html").read_text().replace("/*CORE*/", core)
(root / "index.html").write_text(html)
print("built index.html", len(html), "bytes")
