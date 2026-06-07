import { jsx } from "@b9g/crank/standalone";

export function Footer() {
  return jsx`
    <footer class="footer">
      <div>
        <a href="https://github.com/repeaterjs/repeater">GitHub</a>
        <a href="https://www.npmjs.com/package/@repeaterjs/repeater">NPM</a>
        <a href="/docs/quickstart/">Docs</a>
      </div>
      <small>Copyright © ${new Date().getFullYear()} Brian Kim</small>
    </footer>
  `;
}
