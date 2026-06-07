import { jsx } from "@b9g/crank/standalone";
import type { DocInfo } from "../models/document.js";

// Mirrors the original Docusaurus sidebars.json grouping and order.
const SECTIONS: Array<{ title: string; ids: Array<string> }> = [
  { title: "Getting Started", ids: ["quickstart", "overview", "rationale"] },
  {
    title: "Guides",
    ids: ["safety", "error_handling", "inverted_repeaters", "combinators", "utilities"],
  },
  { title: "API Reference", ids: ["repeater"] },
];

export function Sidebar({ docs, url }: { docs: Array<DocInfo>; url: string }) {
  const norm = (u: string) => u.replace(/\/$/, "");
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return jsx`
    <nav class="sidebar">
      ${SECTIONS.map(
        (section) => jsx`
        <div class="sidebar-section">
          <h3>${section.title}</h3>
          <ul>
            ${section.ids
              .map((id) => byId.get(id))
              .filter((doc): doc is DocInfo => doc != null)
              .map(
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
        </div>
      `,
      )}
    </nav>
  `;
}
