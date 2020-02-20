module.exports = {
  title: "Repeater.js",
  tagline: "The missing constructor for creating safe async iterators",
  organizationName: "repeaterjs",
  projectName: "repeater",
  url: "https://repeater.js.org",
  baseUrl: "/",
  favicon: "img/favicon.ico",
  themeConfig: {
    navbar: {
      title: "Repeater.js",
      // logo: { alt: "Repeater.js logo", src: "img/logo.svg" },
      links: [
        {
          to: "docs/quickstart",
          label: "Docs",
          position: "left",
        },
        {
          to: "docs/repeater",
          label: "API",
          position: "left",
        },
        {
          href: "https://github.com/repeaterjs/repeater",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://www.npmjs.com/package/@repeaterjs/repeater",
          label: "NPM",
          position: "right",
        },
      ],
    },
    footer: {
      links: [],
      logo: {},
      copyright: `Copyright © ${new Date().getFullYear()} Brian Kim`,
    },
  },
  algolia: {
    apiKey: '8a93db8e9eb1ba1b8055d703bd55f523',
    indexName: 'repeater',
  },
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          path: "../docs",
          sidebarPath: require.resolve("./sidebars.json"),
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
};
