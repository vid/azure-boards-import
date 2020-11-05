import { Wiki } from './wiki';
import * as fs from 'fs';
import * as path from 'path';
import { IConfig } from './DevopsApi';
import { isBreakOrContinueStatement } from 'typescript';

export async function go(config: IConfig) {
  const wiki = new Wiki(config);
  const existingWikis = await wiki.getAllWikis();
  console.log('existing wikis', existingWikis.map(e => e.name));
  const wikis = fs.readdirSync(config.wikis).filter(p => fs.statSync(path.join(config.wikis, p)).isDirectory());

  for (const awiki of wikis) {
    let wikiId;
    if (!existingWikis.find(e => e.name === `${config.project}.${awiki}`)) {
      const res = await wiki.createWiki(awiki);
      console.log('created wiki', res);
      wikiId = res.id;
    } else {
      wikiId = existingWikis[0].id;
    }
    const existingPages = await wiki.getWikiPages(wikiId);
    console.log('existingPages', existingPages.map(e => e.path));
    for (const e of existingPages) {
      console.log('del', await wiki.deletePage(wikiId, e));
    }

    async function importPages(from) {
      const pagesToImport = fs.readdirSync(from);
      console.log('importing from', from, pagesToImport);
      for (const p of pagesToImport) {
        const pagePath = path.join(from, p);
        let isParentPage;
        let subPages;
        if (fs.statSync(pagePath).isDirectory()) {
          isParentPage = true;
          subPages = fs.readdirSync(pagePath).filter(p => p.endsWith('.md'));
        }
        if (!isParentPage && !pagePath.endsWith('.md')) {
          throw Error(`unknown file type ${pagePath}`);
        }
        const pageName = p.replace(/\.md$/, '').replace(/.*\//, '');
        const existingPage = existingPages.find(e => e.path === `/${pageName}`);
        const content = isParentPage ? 'ParentPage' : fs.readFileSync(path.join(from, pagePath), 'utf-8');
        let op;
        let res;
        if (existingPage) {
          op = 'update';
          res = await wiki.updatePage(wikiId, existingPage, { content, subPages });
        } else {
          op = 'create';
          res = await wiki.createPage(wikiId, pageName, { content, subPages });
        }
        if (isParentPage) {
          importPages(pagePath);
        }
        console.log(op, pagePath, isOk(res?.statusCode) ? 'ok' : res);
      }
    }


    importPages(path.join(config.wikis, awiki));
  }

}
function isOk(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}