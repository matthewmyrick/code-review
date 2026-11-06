// Stamp a release version into the files the bundler and updater read.
// Used by .github/workflows/release.yml: node scripts/set-version.mjs 0.1.4
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`usage: node scripts/set-version.mjs <major.minor.patch> (got ${version ?? ""})`);
  process.exit(1);
}

for (const path of ["src-tauri/tauri.conf.json", "package.json"]) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`${path} -> ${version}`);
}

// The Rust side too, or a shipped `tandem-cli --version` reports the
// workspace placeholder forever and can't tell you whether it's current.
{
  const path = "Cargo.toml";
  const toml = readFileSync(path, "utf8");
  const stamped = toml.replace(
    /(\[workspace\.package\][\s\S]*?\nversion = ")[^"]*(")/,
    `$1${version}$2`,
  );
  if (stamped === toml) {
    console.error(`${path}: couldn't find [workspace.package] version`);
    process.exit(1);
  }
  writeFileSync(path, stamped);
  console.log(`${path} -> ${version}`);
}
