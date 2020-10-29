import * as vm from "azure-devops-node-api";
import * as azdev from 'azure-devops-node-api';
import * as CoreInterfaces from "azure-devops-node-api/interfaces/CoreInterfaces"
import * as CoreApi from "azure-devops-node-api/CoreApi"

export interface IConfig { adoToken: string, project: string, org: string, bypassRules?: boolean, debug?: boolean, wikis?: string, workitems?: string };

export class DevopsApi {
  auth: IConfig;
  authHandler: any;
  webApi: vm.WebApi;
  _client: any;

  constructor(auth) {
    this.auth = auth;
    this.authHandler = azdev.getPersonalAccessTokenHandler(this.auth.adoToken);
    this.webApi = new azdev.WebApi(`https://dev.azure.com/${this.auth.org}/`, this.authHandler);

    this.webApi.rest
  }
  getWebApi() {
    return this.webApi;
  }
  async getProjectObject() {
    const coreApiObject = await this.getCoreApiObject();
    const projectObject: CoreInterfaces.TeamProject = await coreApiObject.getProject(this.auth.project);
    return projectObject;

  }
  async getCoreApiObject()  {
        const coreApiObject: CoreApi.ICoreApi = await this.webApi.getCoreApi();
        return coreApiObject;
  }
}