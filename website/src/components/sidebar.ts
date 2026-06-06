import { jsx } from "@b9g/crank/standalone";
import type { DocInfo } from "../models/document.js";

export function Sidebar({ docs, url }: { docs: Array<DocInfo>; url: string }) {
  const norm = (u: string) => u.replace(/\/$/, "");
  return jsx`
    <nav class="sidebar">
      <a class="brand" href="/">Repeater.js</a>
      <ul>
        ${docs.map(
          (doc) => jsx`
          <li>
            <a
              href=${doc.url}
              class=${norm(doc.url) === norm(url) ? "active" : ""}
            >${doc.attributes.title}</a>
          </li>
        `,
        )}
      </ul>
    </nav>
  `;
}
