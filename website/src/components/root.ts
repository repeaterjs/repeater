import { jsx, Raw } from "@b9g/crank/standalone";
import type { Children } from "@b9g/crank";

const STYLES = `
:root {
  --bg: #fff; --fg: #1a1a2e; --muted: #5b6472; --accent: #c1272d;
  --sidebar-bg: #faf9f7; --border: #e7e3dc; --code-bg: #f6f5f2;
  --sidebar-w: 17rem; --content-w: 46rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14151a; --fg: #e7e6e3; --muted: #9aa0aa; --accent: #ff6b6b;
    --sidebar-bg: #1b1c22; --border: #2a2c34; --code-bg: #1f2027;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
pre { background: var(--code-bg); padding: 1rem 1.2rem; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
pre code { background: none; padding: 0; }
.layout { display: flex; align-items: flex-start; max-width: 80rem; margin: 0 auto; }
.sidebar {
  width: var(--sidebar-w); flex: none; position: sticky; top: 0;
  height: 100vh; overflow-y: auto; padding: 1.5rem 1rem;
  background: var(--sidebar-bg); border-right: 1px solid var(--border);
}
.sidebar .brand { display: block; font-weight: 700; font-size: 1.2rem; color: var(--fg); margin-bottom: 1.25rem; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 0.15rem 0; }
.sidebar a { display: block; padding: 0.3rem 0.5rem; border-radius: 6px; color: var(--muted); }
.sidebar a:hover { background: var(--border); text-decoration: none; }
.sidebar a.active { color: var(--accent); font-weight: 600; background: var(--border); }
.content { flex: 1 1 auto; max-width: var(--content-w); padding: 2.5rem 2rem 6rem; min-width: 0; }
.content h1 { font-size: 2rem; line-height: 1.2; margin-top: 0; }
.content h2 { margin-top: 2.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }
.content .tagline { font-size: 1.2rem; color: var(--muted); }
@media (max-width: 50rem) {
  .layout { flex-direction: column; }
  .sidebar { width: 100%; height: auto; position: static; border-right: none; border-bottom: 1px solid var(--border); }
}
`;

export function Root({
  title,
  children,
  url,
  description = "",
}: {
  title: string;
  children: Children;
  url: string;
  description?: string;
}) {
  return jsx`
    <${Raw} value="<!DOCTYPE html>" />
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content=${description} />
        <meta property="og:title" content=${title} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content=${`https://repeater.js.org${url}`} />
        <meta property="og:description" content=${description} />
        <style><${Raw} value=${STYLES} /></style>
      </head>
      <body>
        ${children}
      </body>
    </html>
  `;
}
