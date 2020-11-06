import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { DevopsApi } from './DevopsApi';
import { IConfig, IWorkitems } from './IConfig';

export const FSYSTEM = '/fields/System.';
export const FVC = '/fields/Microsoft.VSTS.Common.';

export type TImportWorkItem = {
  '/fields/System.Title': string,
  '/fields/System.Description': string,
  '/fields/System.Tags'?: string,
  '/fields/System.originId': string,
  '/fields/System.history'?: string,
  '/fields/System.relation'?: { rel: string, url: string },
  '/fields/System.areaPath': string,
  _workItemType: string,
  _state: string,
  _defer?: string,
  _id: number,
  _parent?: number,
  _importedId: number
}

export class WorkItems extends DevopsApi {
  workitems: IWorkitems;
  workItemApi: IWorkItemTrackingApi;
  constructor(config: IConfig) {
    super(config);
    this.workitems = config.workitems;
  }

  async getWorkItemTrackingApi() {
    if (this.workItemApi) {
      return this.workItemApi;
    }
    try {
      this.workItemApi = await this.getWebApi().getWorkItemTrackingApi();

      console.info('client logged in');
      return this.workItemApi;
    } catch (error) {
      throw Error(`Connecting to organization. Check the spelling of the organization name and ensure your token is scoped correctly.`);
    }
  }
  // create Work Item via https://docs.microsoft.com/en-us/rest/api/azure/devops/
  async create(item: TImportWorkItem) {
    const client = await this.getWorkItemTrackingApi();
    let patchDocument = Object.keys(item).filter(field => !field.startsWith('_')).map(field => ({
      op: 'add',
      path: field,
      value: item[field]
    }));

    let workItemSaveResult = null;

    try {
      workItemSaveResult = await client.createWorkItem(
        [],
        patchDocument,
        this.auth.project,
        item._workItemType,
        false,
        this.workitems.bypassRules
      );

      // if result is null, save did not complete correctly
      if (workItemSaveResult == null) {
        workItemSaveResult = -1;

        console.error("Error: creatWorkItem failed");
        throw Error(`WIT may not be correct: ${item._workItemType} ${JSON.stringify(item, null, 2)}`);
      }

      return workItemSaveResult;
    } catch (error) {
      console.error('Error: creatWorkItem failed\n', 'item:', item, patchDocument, 'error:', JSON.stringify(error, null, 2));
      throw Error(error);
    }
  }

  async getFields() {
    const client = await this.getWorkItemTrackingApi();
    return await client.getFields(this.auth.project);
  }

  // creates a lookup for work item types
  async getWorkItemTypeMap() {
    const witm = {};
    const types = await this.getWorkItemTypes();
    for (const type of types) {
      const states = await this.getWorkItemTypeStates(type.name);
      witm[type.name] = states.map(s => s.name);
    }
    return witm;
  }
  async getRelationTypes() {
    const client = await this.getWorkItemTrackingApi();
    return await client.getRelationTypes();
  }
  //  https://docs.microsoft.com/en-us/rest/api/azure/devops/wit/work%20items/delete?view=azure-devops-rest-6.0
  async delete(id, destroy = false) {
    const client = await this.getWorkItemTrackingApi();
    return await client.deleteWorkItem(id, this.auth.project, destroy);
  }
  // add comment to an existing work item
  async comment(comment: { text: string, ChangedDate: string, ChangedBy: string }, workItem) {
    const patchDocument = [{
      op: "add",
      path: "/fields/System.History",
      value: comment.text
    },
    {
      "op": "add",
      "path": "/fields/System.ChangedDate",
      "value": comment.ChangedDate
    },
    {
      "op": "add",
      "path": "/fields/System.ChangedBy",
      "value": comment.ChangedBy
    }];

    return await this.updateWorkItem(patchDocument, workItem.id);
  }

  async addParent(parent: { url: string }, workItem) {
    console.log('ap', parent, workItem)
    let patchDocument = [{
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: parent.url
      }
    }];

    return await this.updateWorkItem(patchDocument, workItem.id);
  }

  async getWorkItemTypes() {
    const client = await this.getWorkItemTrackingApi();
    const types = await client.getWorkItemTypes(this.auth.project);
    return types;
  }
  async getWorkItemTypeStates(type: string) {
    const client = await this.getWorkItemTrackingApi();
    const states = await client.getWorkItemTypeStates(this.auth.project, type);
    return states;
  }
  // reopen existing work item
  async reopened(vm, workItem) {
    let patchDocument = [];

    patchDocument.push({
      op: "add",
      path: "/fields/System.State",
      value: vm.env.activeState,
    });;

    patchDocument.push({
      op: "add",
      path: "/fields/System.History",
      value: "Issue reopened",
    });

    if (patchDocument.length > 0) {
      return await this.updateWorkItem(patchDocument, workItem.id);
    } else {
      return null;
    }
  }

  // add new label to existing work item
  async label(vm, workItem) {
    let patchDocument = [];

    if (!workItem.fields["System.Tags"].includes(vm.label)) {
      patchDocument.push({
        op: "add",
        path: "/fields/System.Tags",
        value: workItem.fields["System.Tags"] + ", " + vm.label,
      });
    }

    if (patchDocument.length > 0) {
      return await this.updateWorkItem(patchDocument, workItem.id);
    } else {
      return null;
    }
  }

  async unlabel(vm, workItem) {
    let patchDocument = [];

    if (workItem.fields["System.Tags"].includes(vm.label)) {
      var str = workItem.fields["System.Tags"];
      var res = str.replace(vm.label + "; ", "");

      patchDocument.push({
        op: "add",
        path: "/fields/System.Tags",
        value: res,
      });
    }

    if (patchDocument.length > 0) {
      return await this.updateWorkItem(patchDocument, workItem.id);
    } else {
      return null;
    }
  }

  // find work item to see if it already exists
  async find(number?: Number) {
    let queryResult = null;

    let teamContext = { project: this.auth.project };

    let wiql = {
      query:
        `SELECT [System.Id], [System.WorkItemType], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project`
    };


    try {
      const client = await this.getWorkItemTrackingApi();
      queryResult = await client.queryByWiql(wiql, teamContext);

      // if query results = null then i think we have issue with the project name
      if (queryResult == null) {
        console.error("Error: Project name appears to be invalid");
        throw Error("Error: Project name appears to be invalid");
      }
    } catch (error) {
      console.error("Error: queryByWiql failure");
      console.error(error);
      throw Error(error);
    }
    return queryResult;
  }
  async getWorkItems(workItemIds: number[]) {
    const client = await this.getWorkItemTrackingApi();
    let workItems = [];
    for (const id of workItemIds) {

      try {
        const result = await client.getWorkItem(id, null, null, 4);
        workItems.push(result);
      } catch (error) {
        console.error("Error: getWorkItem failure");
        throw Error(error);
      }
    }
    return workItems;
  }

  // standard updateWorkItem call used for all updates
  async updateWorkItem(patchDocument, id) {
    let workItemSaveResult = null;
    const client = await this.getWorkItemTrackingApi();
    try {
      workItemSaveResult = await client.updateWorkItem(
        [],
        patchDocument,
        id,
        this.auth.project,
        false,
        this.workitems.bypassRules
      );

      return workItemSaveResult;
    } catch (error) {
      console.error("Error: updateWorkItem failed");
      console.error(patchDocument);
      console.error(error);
      throw Error(error.toString());
    }
  }

  /*
  // update the GH issue body to include the AB# so that we link the Work Item to the Issue
  // this should only get called when the issue is created
  async function updateIssueBody(vm, workItem) {
    var n = vm.body.includes("AB#" + workItem.id.toString());
  
    if (!n) {
      const octokit = new github.GitHub(vm.env.ghToken);
      vm.body = vm.body + "\r\n\r\nAB#" + workItem.id.toString();
  
      var result = await octokit.issues.update({
        owner: vm.owner,
        repo: vm.repository,
        issue_number: vm.number,
        body: vm.body,
      });
  
      return result;
    }
  
    return null;
  }

  // get object values from the payload that will be used for logic, updates, finds, and creates
  getValuesFromPayload(payload, env) {
    // prettier-ignore
    var vm = {
      action: payload.action != undefined ? payload.action : "",
      url: payload.issue.html_url != undefined ? payload.issue.html_url : "",
      number: payload.issue.number != undefined ? payload.issue.number : -1,
      title: payload.issue.title != undefined ? payload.issue.title : "",
      state: payload.issue.state != undefined ? payload.issue.state : "",
      user: payload.issue.user.login != undefined ? payload.issue.user.login : "",
      body: payload.issue.body != undefined ? payload.issue.body : "",
      repo_fullname: payload.repository.full_name != undefined ? payload.repository.full_name : "",
      repo_name: payload.repository.name != undefined ? payload.repository.name : "",
      repo_url: payload.repository.html_url != undefined ? payload.repository.html_url : "",
      closed_at: payload.issue.closed_at != undefined ? payload.issue.closed_at : null,
      owner: payload.repository.owner != undefined ? payload.repository.owner.login : "",
      sender_login: payload.sender.login != undefined ? payload.sender.login : '',
      label: "",
      comment_text: "",
      comment_url: "",
      organization: "",
      repository: "",
      env: {
        organization: env.ado_organization != undefined ? env.ado_organization : "",
        orgUrl: env.ado_organization != undefined ? "https://dev.azure.com/" + env.ado_organization : "",
        adoToken: env.ado_token != undefined ? env.ado_token : "",
        ghToken: env.github_token != undefined ? env.github_token : "",
        project: env.ado_project != undefined ? env.ado_project : "",
        areaPath: env.ado_area_path != undefined ? env.ado_area_path : "",
        workItemType: env.ado_wit != undefined ? env.ado_wit : "Issue",
        closedState: env.ado_close_state != undefined ? env.ado_close_state : "Closed",
        newState: env.ado_new_state != undefined ? env.ado_new_state : "New",
        activeState: env.ado_active_state != undefined ? env.ado_active_state : "Active",
        bypassRules: env.ado_bypassrules != undefined ? env.ado_bypassrules : false
      }
    };

    // label is not always part of the payload
    if (payload.label != undefined) {
      vm.label = payload.label.name != undefined ? payload.label.name : "";
    }

    // comments are not always part of the payload
    // prettier-ignore
    if (payload.comment != undefined) {
      vm.comment_text = payload.comment.body != undefined ? payload.comment.body : "";
      vm.comment_url = payload.comment.html_url != undefined ? payload.comment.html_url : "";
    }

    // split repo full name to get the org and repository names
    if (vm.repo_fullname != "") {
      var split = payload.repository.full_name.split("/");
      vm.organization = split[0] != undefined ? split[0] : "";
      vm.repository = split[1] != undefined ? split[1] : "";
    }

    return vm;
  }
  */
}