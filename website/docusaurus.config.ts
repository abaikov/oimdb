import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'OIMDB',
  tagline: 'High-performance reactive in-memory database for frontend applications',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://oimdb.org',
  baseUrl: '/',

  organizationName: 'abaikov',
  projectName: 'oimdb',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/abaikov/oimdb/tree/master/website/',
        },
        blog: {
          showReadingTime: true,
          blogTitle: 'OIMDB Engineering',
          blogDescription:
            'Design decisions and trade-offs behind OIMDB — what options we had and why we picked ours.',
          postsPerPage: 10,
          blogSidebarTitle: 'All posts',
          blogSidebarCount: 'ALL',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'OIMDB',
      logo: {
        alt: 'OIMDB Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/blog',
          label: 'Blog',
          position: 'left',
        },
        {
          href: 'https://github.com/abaikov/oimdb',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/docs/intro'},
            {label: 'Quick Start', to: '/docs/getting-started/quick-start'},
            {label: 'Core Model', to: '/docs/core/model'},
            {label: 'Performance', to: '/docs/guides/performance'},
          ],
        },
        {
          title: 'Packages',
          items: [
            {
              label: 'npm: @oimdb/core',
              href: 'https://www.npmjs.com/package/@oimdb/core',
            },
            {
              label: 'npm: @oimdb/react',
              href: 'https://www.npmjs.com/package/@oimdb/react',
            },
            {
              label: 'npm: @oimdb/redux-adapter',
              href: 'https://www.npmjs.com/package/@oimdb/redux-adapter',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/abaikov/oimdb',
            },
            {
              label: 'Issues',
              href: 'https://github.com/abaikov/oimdb/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Andrei Baikov. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'diff'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
