/**
 * A two-line shim for launch configs that cannot set a working directory.
 *
 * `dev-mirror.mjs` reads `.env.local` and runs `next` relative to cwd, so it
 * only works from the repository root — but the Claude session that drives
 * the browser preview lives in a different directory, and its launcher has
 * no cwd knob. This hops into the repo first and hands over unchanged.
 */
process.chdir(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
await import("./dev-mirror.mjs");
