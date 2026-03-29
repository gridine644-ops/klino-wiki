// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://gridine644-ops.github.io',
  base: '/klino-wiki',
 integrations: [
  starlight({
   title: 'Эхо Безликих',
   defaultLocale: 'ru',
   customCss: ['./src/styles/custom.css'],
   sidebar: [
    {
     label: 'Главная',
     items: [
      { label: 'О вселенной', slug: 'index' },
     ],
    },
    {
     label: 'Персонажи',
     autogenerate: { directory: 'characters' },
    },
    {
     label: 'Локации',
     autogenerate: { directory: 'locations' },
    },
    {
     label: 'Лор',
     autogenerate: { directory: 'lore' },
    },
   ],
  }),
 ],
});