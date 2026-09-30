const message = [
  "cloudbase-skills — the CloudBase skill is registered by @cloudbase/dsh-plugin.",
  "It is read from the package and is not copied into ~/.dsh/skills/.",
  "",
].join("\n");

process.stdout.write(`${message}\n`);
