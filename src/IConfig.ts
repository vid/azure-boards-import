

export interface IAuth { org: string; project: string; adoToken: string; }
export interface IWorkitems {
  limit?: number;
  only?: number;
  // useful to, for example, not check users
  bypassRules?: boolean;
  file: string;
  // location of wikis to import, for example `import/wikis`
  type_mappings: { [type: string]: string; };
  defer_types: string[],
  state_mappings: { [type: string]: { [state: string]: string; }; };
  people_mappings: {};
  default_area: string;
  priorities: { [name: string]: number }
}

export interface IConfig {
  auth: IAuth;
  // limit import to this number
  // location of workitems csv
  wikis: {
    dir: string;
  },
  workitems: IWorkitems
}
