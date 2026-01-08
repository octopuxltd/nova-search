# How to reach Figma MCP tool

1) Always include `dirForAssetWrites` in every Figma design/screenshot call. Example: `/Users/pannett/Vibe coding/nova/assets`. Without it, the server rejects the request and looks unreachable.
2) Make sure the target node is selected in Figma before asking to pull it. If reachable but nothing is selected, the server replies “Nothing is selected.”
3) If tools still don’t appear, toggle the Figma server in Cursor: Settings → Tools & MCP → Figma Desktop off/on, then retry.
4) Config reference (already set): `~/.cursor/mcp.json` → `http://127.0.0.1:3845/mcp`.

Fast ask for future:
“Call the Figma tools with `dirForAssetWrites=/Users/pannett/Vibe coding/nova/assets` and pull the currently selected node.”

