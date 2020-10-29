import { Wiki } from './wiki';
import * as fs from 'fs';
import * as path from 'path';
import { IConfig } from './DevopsApi';

export async function go(config: IConfig) {
  const pagesToImport = fs.readdirSync(config.wikis).filter(p => p.endsWith('.md'));
  const wiki = new Wiki(config);
  const existingWikis = await wiki.getAllWikis();

  let wikiId;
  if (pagesToImport.length < 1) {
    const res = await wiki.createWiki('wiki');
    console.log('created wiki', res);
    wikiId = res.id;
  } else {
    wikiId = existingWikis[0].id;
  }
  console.log('existing wikis', existingWikis);
  for (const w of pagesToImport) {
    const pageName = w.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(config.wikis, w), 'utf-8');
    const res = await wiki.createPage(wikiId, pageName, { content });
    console.log('r', w, res);
  }
}