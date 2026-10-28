import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const path of [".", "scripts", "tests"])
  for (const file of readdirSync(path).filter((f) => /\.(js|mjs)$/.test(f))) {
    const result = spawnSync(process.execPath, ["--check", `${path}/${file}`], {
      stdio: "inherit",
    });
    if (result.status) process.exit(result.status);
  }
