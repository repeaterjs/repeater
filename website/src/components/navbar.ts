import { jsx } from "@b9g/crank/standalone";

export function Navbar() {
  return jsx`
    <header class="navbar">
      <a class="navbar-brand" href="/">Repeater.js</a>
      <nav class="navbar-links">
        <a href="/docs/quickstart/">Docs</a>
        <a href="/docs/repeater/">API</a>
        <a href="https://github.com/repeaterjs/repeater">GitHub</a>
        <a href="https://www.npmjs.com/package/@repeaterjs/repeater">NPM</a>
      </nav>
    </header>
  `;
}
