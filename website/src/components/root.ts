import { jsx, Raw } from "@b9g/crank/standalone";
import type { Children } from "@b9g/crank";
import { Navbar } from "./navbar.js";
import { Footer } from "./footer.js";

const STYLES = `
:root {
  --bg: #fff; --fg: #1a1a2e; --muted: #5b6472; --accent: #c1272d;
  --sidebar-bg: #faf9f7; --border: #e7e3dc; --code-bg: #f6f5f2; --nav-bg: #fff;
  --sidebar-w: 17rem; --content-w: 46rem;
  --tok-comment: #6a737d; --tok-keyword: #d73a49; --tok-string: #032f62;
  --tok-function: #6f42c1; --tok-number: #005cc5; --tok-punct: #24292e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14151a; --fg: #e7e6e3; --muted: #9aa0aa; --accent: #ff6b6b;
    --sidebar-bg: #1b1c22; --border: #2a2c34; --code-bg: #1f2027; --nav-bg: #14151a;
    --tok-comment: #8b949e; --tok-keyword: #ff7b72; --tok-string: #a5d6ff;
    --tok-function: #d2a8ff; --tok-number: #79c0ff; --tok-punct: #c9d1d9;
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
.token.comment, .token.prolog, .token.doctype, .token.cdata { color: var(--tok-comment); font-style: italic; }
.token.keyword, .token.boolean, .token.tag { color: var(--tok-keyword); }
.token.string, .token.char, .token.attr-value, .token.regex, .token.template-string { color: var(--tok-string); }
.token.function, .token.class-name { color: var(--tok-function); }
.token.number, .token.constant, .token.symbol { color: var(--tok-number); }
.token.operator, .token.punctuation { color: var(--tok-punct); }

/* Navbar */
.navbar {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
  justify-content: space-between; gap: 1rem; padding: 0.75rem 1.5rem;
  background: var(--nav-bg); border-bottom: 1px solid var(--border);
}
.navbar-brand { font-weight: 700; font-size: 1.15rem; color: var(--fg); }
.navbar-links { display: flex; gap: 1.25rem; }
.navbar-links a { color: var(--muted); font-weight: 500; }
.navbar-links a:hover { color: var(--accent); text-decoration: none; }

/* Docs layout */
.layout { display: flex; align-items: flex-start; max-width: 80rem; margin: 0 auto; }
.sidebar {
  width: var(--sidebar-w); flex: none; position: sticky; top: 3.25rem;
  height: calc(100vh - 3.25rem); overflow-y: auto; padding: 1.5rem 1rem;
  border-right: 1px solid var(--border);
}
.sidebar-section { margin-bottom: 1.5rem; }
.sidebar-section h3 {
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted); margin: 0 0 0.4rem 0.5rem;
}
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 0.1rem 0; }
.sidebar a { display: block; padding: 0.3rem 0.5rem; border-radius: 6px; color: var(--muted); }
.sidebar a:hover { background: var(--border); text-decoration: none; }
.sidebar a.active { color: var(--accent); font-weight: 600; background: var(--border); }
.content { flex: 1 1 auto; max-width: var(--content-w); padding: 2.5rem 2rem 6rem; min-width: 0; }
.content h1 { font-size: 2rem; line-height: 1.2; margin-top: 0; }
.content h2 { margin-top: 2.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }

/* Home hero + features */
.hero { text-align: center; padding: 5rem 1.5rem 3rem; max-width: 50rem; margin: 0 auto; }
.hero h1 { font-size: 3.5rem; margin: 0; }
.hero-tagline { font-size: 1.4rem; color: var(--muted); margin: 0.5rem 0 2rem; }
.hero-actions { display: flex; gap: 1rem; justify-content: center; margin-bottom: 2rem; }
.button {
  display: inline-block; padding: 0.6rem 1.4rem; border-radius: 8px;
  background: var(--accent); color: #fff; font-weight: 600;
}
.button:hover { text-decoration: none; opacity: 0.9; }
.button-ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.hero-install { display: inline-block; text-align: left; }
.features {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem;
  max-width: 70rem; margin: 0 auto; padding: 2rem 1.5rem 5rem;
}
.feature h2 { margin-top: 0; }

/* Footer */
.footer {
  border-top: 1px solid var(--border); padding: 2rem 1.5rem; text-align: center;
  color: var(--muted);
}
.footer div { display: flex; gap: 1.25rem; justify-content: center; margin-bottom: 0.5rem; }
.footer a { color: var(--muted); }

@media (max-width: 50rem) {
  .layout { flex-direction: column; }
  .sidebar { width: 100%; height: auto; position: static; border-right: none; border-bottom: 1px solid var(--border); }
  .features { grid-template-columns: 1fr; }
  .hero h1 { font-size: 2.5rem; }
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
        <${Navbar} />
        ${children}
        <${Footer} />
      </body>
    </html>
  `;
}
