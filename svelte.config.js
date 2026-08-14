import { loadEnv } from "vite";
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

// PUBLIC_SSR picks the deployment target: a Node server that renders pages
// (yes) or a static single-page bundle (no, the default). The same flag turns
// SSR on in +layout.ts.
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
