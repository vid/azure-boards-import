import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { TeamSettingsIteration } from 'azure-devops-node-api/interfaces/WorkInterfaces';
import { IWorkApi } from 'azure-devops-node-api/WorkApi';
import { DevopsApi } from './DevopsApi';

export class Work extends DevopsApi {
  workApi: IWorkApi;

  async getWorkApi() {
    if (this.workApi) {
      return this.workApi;
    }
    try {
      this.workApi = await this.getWebApi().getWorkApi();

      console.info('client logged in');
      return this.workApi;
    } catch (error) {
      throw Error(`Connecting to organization. Check the spelling of the organization name and ensure your token is scoped correctly.`);
    }
  }
  async getTeamIterations(team: TeamContext) {
    const client = await this.getWorkApi();
    return await client.getTeamIterations(team, 'current');
  }
  async createTeamIteration(team: TeamContext, iteration: TeamSettingsIteration) {
    const client = await this.getWorkApi();
    return await client.postTeamIteration(iteration, team);
  }

}