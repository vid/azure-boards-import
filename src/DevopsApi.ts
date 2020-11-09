import * as vm from "azure-devops-node-api";
import * as azdev from 'azure-devops-node-api';
import * as CoreInterfaces from "azure-devops-node-api/interfaces/CoreInterfaces"
import * as CoreApi from "azure-devops-node-api/CoreApi"
import { IAuth, IConfig } from "./IConfig";


export class DevopsApi {
  webApi: vm.WebApi;
  authHandler: any;
  auth: IAuth;

  constructor(config: IConfig) {
    this.auth = config.auth;
    this.authHandler = azdev.getPersonalAccessTokenHandler(this.auth.adoToken);
    this.webApi = new azdev.WebApi(`https://dev.azure.com/${this.auth.org}/`, this.authHandler);
  }

  put(path, resources, options?) {
    return this.hack({ op: 'put', path, resources, options });
  }
  patch(path, resources, options?) {
    return this.hack({ op: 'patch', path, resources, options });
  }
  get(path, options?) {
    return this.hack({ op: 'get', path, options });
  }
  delete(path, options?) {
    return this.hack({ op: 'DELETE', path, options });
  }

  // FIXME some methods don't seem to be fully supported. there is probably a better way to do this
  private hack({ op, path, resources, options }: { op: string, path: string, resources?: string, options?: string }) {
    console.log('op', op, this.webApi.rest[op])
    if (!(this.webApi.rest as any)[op]) {
      const r = this.webApi.rest as any;

      this.webApi.rest[op] = async (url: string, resources: any, options?/*: IRequestOptions*/)/*: Promise<IRestResponse<T>>*/ => {
        // FIXME internal method doesn't include some options like If-Match
        const headers = { ...r._headersFromOptions(options, true), ...options };
        const data: string = JSON.stringify(resources, null, 2);
        const res = await r.client[op](url, data, headers);
        return r.processResponse(res, options);
      }
    }
    const url = this.getApiPath(path);
    return (this.webApi.rest as any)[op](url, resources, options);
  }

  getWebApi() {
    return this.webApi;
  }
  async getProjectObject() {
    const coreApiObject = await this.getCoreApiObject();
    const projectObject: CoreInterfaces.TeamProject = await coreApiObject.getProject(this.auth.project);
    return projectObject;

  }
  async getCoreApiObject() {
    const coreApiObject: CoreApi.ICoreApi = await this.webApi.getCoreApi();
    return coreApiObject;
  }
  getApiPath(append: string) {
    return `https://${this.auth.adoToken}@dev.azure.com/${this.auth.org}/${this.auth.project}/_apis` + append;
  }
  async getTeams() {
    const coreApiObject = await this.getCoreApiObject();
    return await await coreApiObject.getAllTeams();
  }
}
