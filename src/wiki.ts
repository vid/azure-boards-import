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
      throw Error(`Connecting to organization. Check the spelling of the organization name and ensure your token is scoped correctly.`);
    }
  }

  async getAllWikis() {
    const client = await this.getWikiApi();
    const wikis: WikiInterfaces.WikiV2[] = await client.getAllWikis(this.auth.project);
    return wikis;
  }

  async createWiki(name) {
    const projectObject = await this.getProjectObject();
    const client = await this.getWikiApi();
    try {
      const wikiParams: WikiInterfaces.WikiCreateParametersV2 = { name, projectId: projectObject.id };
      const newWiki = await client.createWiki(wikiParams, this.auth.project);
      console.log("Wiki created:", newWiki.name);
      return newWiki;
    } catch (error) {
      console.error('Error: create wiki failed\n', 'item:', name);
      throw Error(error);
    }
  }
  async getWikiPages(wiki) {
    const client = await this.getWikiApi();
  }

  async getPageText(wikiId) {
    const wikiApi = await this.getWikiApi();
    const pageText: NodeJS.ReadableStream = await wikiApi.getPageText(this.auth.project, wikiId)
    return pageText.read().toString();
  }

  async deleteWiki(wikiId) {
    const wikiApi = await this.getWikiApi();
    const deletedWiki: WikiInterfaces.WikiV2 = await wikiApi.deleteWiki(wikiId, this.auth.project);
    return deletedWiki;
  }

  async createPage(wikiIdentifier, name, params: WikiInterfaces.WikiPageCreateOrUpdateParameters) {
    const webApi = this.webApi;
    const url = `https://${this.auth.adoToken}@dev.azure.com/vidazure/${this.auth.project}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${name}&api-version=6.0`;
    // FIXME there is probably a better way to do this
    const r = webApi.rest as any;
    r.put = async (resource: string, resources: any, options?/*: IRequestOptions*/)/*: Promise<IRestResponse<T>>*/ => {

        const headers = r._headersFromOptions(options, true);

        const data: string = JSON.stringify(resources, null, 2);
        const res = await r.client.put(url, data, headers);
        return r.processResponse(res, options);
    }
    return await r.put(url, {content: params.content})
  }
}