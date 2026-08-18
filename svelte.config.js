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

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: ssr ? adapterNode() : adapterStatic({ fallback: "index.html" }),
  },
};

export default config;
