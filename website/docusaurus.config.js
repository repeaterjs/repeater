module.exports = {
  title: "Channel.js",
  tagline: "The missing constructor for creating safe async iterators",
  url: "https://your-docusaurus-test-site.com",
  baseUrl: "/",
  favicon: "img/logo.ico",
  themeConfig: {
    navbar: {
      title: "Channel.js",
      logo: {
        alt: "Channel.js logo",
        src: "img/logo.svg",
      },
      links: [
        { to: "docs/get-started", label: "Docs", position: "left" },
        { to: "api", label: "API", position: "left" },
        { to: "blog", label: "Blog", position: "left" },
        {
          href: "https://github.com/channeljs/channel",
          label: "GitHub",
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
          sidebarPath: require.resolve("./sidebars.json"),
        },
      },
    ],
  ],
};
