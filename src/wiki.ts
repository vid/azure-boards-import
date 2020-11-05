import * as WikiApi from "azure-devops-node-api/WikiApi";
import * as WikiInterfaces from "azure-devops-node-api/interfaces/WikiInterfaces";
import { DevopsApi } from './DevopsApi';

export class Wiki extends DevopsApi {
  authHandler: any;
  wikiApi: WikiApi.IWikiApi;

  async getWikiApi() {
    if (this.wikiApi) {
      return this.wikiApi;
    }
    try {
      this.wikiApi = await this.getWebApi().getWikiApi();

      console.info('client logged in');
      return this.wikiApi;
    } catch (error) {
      throw Error('Connecting to organization. Check the spelling of the organization name and ensure your token is scoped correctly.');
    }
  }

  async getAllWikis() {
    const client = await this.getWikiApi();
    const wikis: WikiInterfaces.WikiV2[] = await client.getAllWikis(this.config.project);
    return wikis;
  }

  async getPageVersion(wikiIdentifier, id) {
    const path = `/wiki/wikis/${wikiIdentifier}/pages/${id}?api-version=6.0-preview.1`;
    const res = await this.get(path);
    return res?.headers?.etag;
  }

  async updatePage(wikiIdentifier, existingPage, params) {
    const version = await this.getPageVersion(wikiIdentifier, existingPage.id);
    const url = `/wiki/wikis/${wikiIdentifier}/pages/${existingPage.id}?api-version=6.0-preview.1`;
    return await this.patch(url, { content: params.content }, { 'If-Match': version })
  }

  // FIXME does not work, so more than one wiki isn't supported
  async createWiki(name) {
    const projectObject = await this.getProjectObject();
    const client = await this.getWikiApi();
    try {
      const wikiParams: WikiInterfaces.WikiCreateParametersV2 = { name, projectId: projectObject.id };
      const newWiki = await client.createWiki(wikiParams, this.config.project);
      console.log('Wiki created:', newWiki.name);
      return newWiki;
    } catch (error) {
      console.error('Error: create wiki failed\n', 'item:', name);
      throw Error(error);
    }
  }
  async getWikiPages(wikiIdentifier) {
    const client = await this.getWikiApi();
    const batch = {};
    const res = await client.getPagesBatch(batch, this.config.project, wikiIdentifier);
    return res;
  }

  async getPageText(wikiId) {
    const wikiApi = await this.getWikiApi();
    const pageText: NodeJS.ReadableStream = await wikiApi.getPageText(this.config.project, wikiId)
    return pageText.read().toString();
  }

  async deleteWiki(wikiId) {
    const wikiApi = await this.getWikiApi();
    const deletedWiki: WikiInterfaces.WikiV2 = await wikiApi.deleteWiki(wikiId, this.config.project);
    return deletedWiki;
  }

  async createPage(wikiIdentifier, name, params/*: WikiInterfaces.WikiPageCreateOrUpdateParameters*/) {
    const url = `/wiki/wikis/${wikiIdentifier}/pages?path=${name}&api-version=6.0`;
    return await this.put(url, { content: params.content })
  }

  async deletePage(wikiIdentifier, existingPage) {
    const url = `/wiki/wikis/${wikiIdentifier}/pages/${existingPage.id}?api-version=6.0-preview.1`;
    return await this.delete(url);
  }
}
