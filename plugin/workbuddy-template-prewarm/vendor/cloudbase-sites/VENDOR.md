# Vendored CloudBase Sites CLI (preview subset)

Copied from sibling `plugin/cloudbase-sites` (`bin/` + `lib/` only).

Purpose: let `workbuddy-template-prewarm` start Sites-aligned preview
(ports 17173..17272) after marketplace install **without** requiring the full
`cloudbase-sites` plugin hooks to be enabled.

Refresh:
```bash
bash plugin/workbuddy-template-prewarm/scripts/sync-sites-vendor.sh
```

Do not edit files under this tree by hand — re-sync from upstream Sites.
