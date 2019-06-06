module.exports = {
  title: "Channel.js",
  tagline: "The missing constructor for creating safe async iterators",
  url: "https://your-docusaurus-test-site.com",
  baseUrl: "/",
  favicon: "img/favicon.ico",
  themeConfig: {
    navbar: {
      title: "Channel.js",
      logo: { alt: "Channel.js logo", src: "img/logo.svg" },
      links: [
        {
          to: "docs/quickstart",
          label: "Docs",
          position: "left",
        },
        {
          to: "api",
          label: "API",
          position: "left",
        },
        {
          to: "blog",
          label: "Blog",
          position: "left",
        },
        {
          href: "https://github.com/channeljs/channel",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://www.npm.im/@channel/channel",
          label: "NPM",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [],
      logo: {},
      copyright: `Copyright © ${new Date().getFullYear()} Brian Kim`,
    },
  },
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          path: "./docs",
          sidebarPath: require.resolve("./sidebars.json"),
        },
      },
    ],
  ],
};
