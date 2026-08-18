import { installBundledSkills, listInstalledSkills } from "./skill-sync.js";

const command = process.argv[2] ?? "help";

if (command === "sync" || command === "install") {
  const target = installBundledSkills();
  const names = listInstalledSkills(target);
  process.stdout.write(`Installed CloudBase skills → ${target}\n${names.join("\n")}\n`);
} else {
  process.stdout.write(
    [
      "cloudbase-skills — install CloudBase skills into ~/.dsh/skills/cloudbase/",
      "",
      "Usage:",
      "  cloudbase-skills sync",
      "",
      "P0 copies the bundle-carried skill set. Pulling live SKILL.md from",
      "CloudBase-AI-Toolkit is a P1 syncer.",
      "",
    ].join("\n"),
  );
}
