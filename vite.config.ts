import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// Version comes from package.json; a build that is not exactly the tagged
// release commit (or has local changes) carries the commit as build metadata,
// e.g. 0.3.0+a1b2c3d or 0.3.0+a1b2c3d.dirty, so bug reports tell them apart.
function version(): { version: string; commit: string } {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const commit = git("rev-parse --short HEAD");
  const tagged = git("tag --points-at HEAD")
    .split("\n")
    .includes(`v${pkg.version}`);
  const dirty = git("status --porcelain --untracked-files=no") !== "";
  let v = pkg.version;
  if (commit && (!tagged || dirty)) v += `+${commit}${dirty ? ".dirty" : ""}`;
  return { version: v, commit };
}

// PUBLIC_SSR is a build-time decision (it also picks the adapter in
// svelte.config.js), so it is compiled in as a constant rather than read from
// the environment when the server starts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_");
  const ssr = (process.env.PUBLIC_SSR ?? env.PUBLIC_SSR) === "yes";
  const build = version();
  return {
    plugins: [tailwindcss(), sveltekit()],
    define: {
      __SQUALK_SSR__: JSON.stringify(ssr),
      __SQUALK_VERSION__: JSON.stringify(build.version),
      __SQUALK_COMMIT__: JSON.stringify(build.commit),
    },
  };
});
