

export interface IAuth {
  org: string;
  project: string;
  adoToken: string;
  team: string;
}
export interface IWorkitems {
  deleteAllFirst?: boolean,
  doImport?: boolean,
  limit?: number;
  only?: number;
  // useful to, for example, not check users
  bypassRules?: boolean;
  file?: string;
  // location of wikis to import, for example `import/wikis`
  type_mappings: { [type: string]: string; };
  defer_types: string[],
  state_mappings: { [type: string]: { [state: string]: string; }; };
  people_mappings: {};
  default_area: string;
  priorities: { [name: string]: number }
}

export interface IConfig {
  // usually retrieved via auth.team
  teamId?: string,
  auth: IAuth;
  // limit import to this number
  // location of workitems csv
  wikis: {
    dir: string;
  },
  workitems: IWorkitems
}
