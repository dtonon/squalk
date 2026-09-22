import { existsSync } from "node:fs";
import { loadEnv } from "vite";
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

// PUBLIC_SSR picks the deployment target: a Node server that renders pages
// (yes) or a static single-page bundle (no, the default). vite.config.ts bakes
// the same flag into the app as SSR_ENABLED.
const env = loadEnv(
  process.env.NODE_ENV ?? "production",
  process.cwd(),
  "PUBLIC_",
);
const ssr = (process.env.PUBLIC_SSR ?? env.PUBLIC_SSR) === "yes";

// Instance assets: a build run with `--mode <mode>` serves the files in
// .local/<mode>/static (gitignored) instead of the shared static/ folder.
const argv = process.argv;
const modeIdx = argv.findIndex((a) => a === "--mode" || a === "-m");
const mode =
  modeIdx !== -1
    ? argv[modeIdx + 1]
    : argv.find((a) => a.startsWith("--mode="))?.slice(7);
const instanceAssets = mode ? `.local/${mode}/static` : undefined;
const assets =
  instanceAssets && existsSync(instanceAssets) ? instanceAssets : "static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: ssr ? adapterNode() : adapterStatic({ fallback: "index.html" }),
    files: { assets },
  },
};

export default config;
