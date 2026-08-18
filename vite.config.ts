import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

// PUBLIC_SSR is a build-time decision (it also picks the adapter in
// svelte.config.js), so it is compiled in as a constant rather than read from
// the environment when the server starts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_");
  const ssr = (process.env.PUBLIC_SSR ?? env.PUBLIC_SSR) === "yes";
  return {
    plugins: [tailwindcss(), sveltekit()],
    define: { __SQUALK_SSR__: JSON.stringify(ssr) },
  };
});
