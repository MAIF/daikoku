// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';

const redocusaurus = [
  'redocusaurus',
  {
    specs: [
      {
        spec: 'static/openapi/admin-api-openapi.json',
        route: '/openapi',
      },
    ],
  },
];

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Daikoku',
  tagline: '大黒天',
  favicon: 'img/daikoku-mini.svg',

  // Set the production url of your site here
  url: 'https://maif.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'MAIF', // Usually your GitHub org/user name.
  projectName: 'Daikoku', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          sidebarPath: './sidebars.js',
        },
        blog: {
          showReadingTime: true
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
    redocusaurus
  ],
  themes: [
    [
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      "@easyops-cn/docusaurus-search-local",
      ({
        hashed: true,
        language: ["en", "zh"],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/daikoku-mini.jpg',
      navbar: {
        title: 'Daikoku',
        logo: {
          alt: 'Daikoku logo',
          className: 'header-logo',
          // srcDark: 'img/daikoku-mini.svg',
          src: 'img/daikoku-mini-dark.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          // { to: '/blog', label: 'Blog', position: 'left' },
          { to: '/openapi', label: 'OpenAPI', position: 'left' },
          {
            href: 'https://github.com/maif/daikoku',
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'GitHub repository',
          }
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Tutorial',
                to: '/docs/getstarted',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Discord',
                href: 'https://discord.gg/vUP2eKYu',
              },
              {
                label: 'Gitter',
                href: 'https://app.gitter.im/#/room/#MAIF_daikoku:gitter.im',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/maif/daikoku'
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
