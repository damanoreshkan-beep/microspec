# microspec — Act A demo: "the gate blocks a broken app" (see docs/DEMO.md)
# Render:  vhs docs/demo/preflight.tape   →   docs/demo/gate.gif
# Run from the repo root. Self-restores the edited file, so the repo stays clean.

Output docs/demo/gate.gif

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 660
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "alias pf='deno run -A --import-map=packages/gates/preflight.importmap.json packages/gates/preflight.mjs'"
Enter
Type "clear"
Enter
Show

# 1) An app in the farm — green.
Type "pf apps/hf"
Enter
Sleep 2.5s

# 2) The agent ships a feature and forgets one translation.
Type "deno run -A docs/demo/break.mjs"
Enter
Sleep 1.5s

# 3) The gate catches it in ~2s — no human reviewed this.
Type "pf apps/hf"
Enter
Sleep 3.5s

# 4) Fixed. Green. Only green merges.
Type "git checkout apps/hf/i18n/uk.json && pf apps/hf"
Enter
Sleep 3s
