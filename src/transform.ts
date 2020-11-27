import { IWorkitems } from './IConfig';
import { ISSUE_ID, getPerson, jiraDateToADate, TTransformContext, TtransformFunc } from './import-workitems';
import { jiraMdToAzboardsHTML } from './jira-md-transformer';
import { FVC, TImportWorkItem, TPImportWorkItem } from './work-items';

// keys that exist will replace input key
// field list https://docs.microsoft.com/en-us/azure/devops/boards/work-items/guidance/work-item-field?view=azure-devops


export class Transformer {
  lastID: number = -1;
  lastSeq: number = -100;
  wconfig: IWorkitems;
  idMap: any;

  constructor(wconfig: IWorkitems) {
    this.wconfig = wconfig;
    this.idMap = {};
  }
  transform(): TtransformFunc {
    const aPeopleFinder = (field) => ({ newItem, v }: TTransformContext) => {
      const person = getPerson(v, this.wconfig.people_mappings);
      newItem[field] = person;
    };
    return {
      [ISSUE_ID]: null,
      "Issue Type": (ctx) => this.setType(ctx, this.wconfig.type_mappings),
      Summary: ({ v, importItem, newItem }) => {
        newItem['/fields/System.Title'] = `${(v as string).substr(0, 240)} (${importItem['Issue key']})`;
        if ((v as string).length > 240) {
          this.addDescComment(newItem, `Title truncated from "${v}"`);
        }
      },
      Created: ({ v, newItem }) => newItem['/fields/System.CreatedDate'] = jiraDateToADate(v),
      Resolved: ({ v, newItem }) => newItem[`${FVC}ClosedDate`] = jiraDateToADate(v),
      "Custom field (Start date)": undefined,
      Description: ({ v, newItem }) => {
        const desc = jiraMdToAzboardsHTML(v as string);
        console.log('v', v, desc)
        newItem['/fields/System.Description'] = desc;
      },
      Status: (ctx) => this.getStatus(ctx, this.wconfig.state_mappings, this.wconfig.defer_types),
      Comment: ({ newItem, v }) => {
        for (const c of (v as string[])) {
          const [date, who, ...comment] = c.split(';');
          this.addComment(newItem, new Date(date), who, comment.join(';'));
        }
      },
      Assignee: aPeopleFinder('/fields/System.AssignedTo'),
      Priority: ctx => this.setPriority(ctx, this.wconfig.priorities),
      Creator: aPeopleFinder('/fields/System.CreatedBy'),
      'Due date': undefined,

      Reporter: undefined,
      Updated: undefined,
      Watchers: undefined,
      Attachment: ({ newItem, v }) => {
        const s = JSON.stringify(v).replace(/"/g, '');
        if (s?.length > 0) {
          this.addIdMapTag(newItem, 'Attachment');
          this.addDescComment(newItem, `Has attachment ${s}`);
        }
      },
      Sprint: ({ newItem, v }) => this.addIdMapTag(newItem, v),
      Parent: '_parent',

      "Issue key": null,
      "Project key": null,
      "Project name": null,
      "Project type": null,
      "Project lead": null,
      "Project description": null,
      "Resolution": undefined,
      "Last Viewed": null,
      "Votes": null,
      "Environment": null,
      "Original Estimate": undefined,
      "Remaining Estimate": undefined,
      "Time Spent": undefined,
      "Work Ratio": undefined,
      "Σ Original Estimate": undefined,
      "Σ Remaining Estimate": undefined,
      "Σ Time Spent": undefined,
      "Security Level": null,
      "Outward issue link (Blocks)": undefined,
      "Outward issue link (Relates)": undefined,
      "Custom field (Class)": null,
      "Custom field (Definition)": null,
      "Custom field (ID)": null,
      "Custom field (Impact)": null,
      "Custom field (Issue color)": null,
      "Custom field (Mitigation)": null,
      "Custom field (Name)": null,
      "Custom field (Probability)": null,
      "Custom field (Rank)": null,
      "Custom field (Story point estimate)": undefined,
      "Custom field (Supplemental Guidance)": undefined,
      "Custom field (Title)": null,
      "Parent summary": null,
      "Status Category": undefined
    }
  }
  addUndefined(newItem: TPImportWorkItem, desc) {
    this.addDescComment(newItem, desc)
  }
  addIdMapItem(newItem: TPImportWorkItem, what, where) {
    const id = newItem._id;
    if (!id) {
      throw Error(`missing id ${JSON.stringify(newItem)}`);
    }
    let c = this.idMap[id] || { key: id };
    let dest: string[] = c[where] || [];
    if (Array.isArray(what)) {
      dest = dest.concat(what);
    } else {
      dest.push(what);
    }
    dest = dest.filter(d => (typeof d !== 'string' || d.length > 0));
    this.idMap[id] = { ...c, ...{ [where]: dest } };
  }
  addIdMapTag(newItem: TPImportWorkItem, tag) {
    this.addIdMapItem(newItem, tag, 'tags');
  }
  addDescComment(newItem: TPImportWorkItem, desc) {
    if (this.lastID !== newItem._id) {
      this.lastID = newItem._id;
      this.lastSeq = -100;
    }
    const d = new Date(Date.now() + this.lastSeq++ * 60000);
    this.addComment(newItem, d, 'import', desc);
  }
  addComment(newItem: TPImportWorkItem, date, who, comment) {
    if (comment?.length < 1) {
      return;
    }
    this.addIdMapItem(newItem, { date, who, comment }, 'comments');
  }

  setPriority(ctx, priority_mapping) {
    const pi = priority_mapping[ctx.v];
    if (pi === undefined) {
      throw Error(`unknown priority ${ctx.v}`)
    }
    ctx.newItem[`${FVC}Priority`] = pi;
  }

  setType(ctx, type_mappings) {
    this.setValue('_workItemType', type_mappings, ctx, true);
  }

  getStatus(ctx: TTransformContext, state_mappings, defer_types) {
    const { newItem } = ctx;
    const sf = '/fields/System.State';
    const type = newItem._workItemType;
    const inp = ctx.v as string;
    if (!state_mappings[type]) {
      throw Error(`no type ${type} from ${Object.keys(state_mappings)}`);
    }
    const value = state_mappings[type][inp] || inp;
    if (!value) {
      throw Error(`no value for ${inp} for ${type} from ${state_mappings[type]}`);
    }
    if (defer_types.includes(type)) {
      newItem._defer = type;
    } else {
      if (!ctx.remoteStateMap[type]?.includes(value)) {
        throw Error(`no remote type ${value} for ${type} from ${ctx.remoteStateMap[type]}`);
      }
    }
    newItem[sf] = value;
  }

  setValue(field, map, { v: value, importItem, newItem }, useDefault: ((v) => string) | boolean) {
    let what = map[value];
    if (typeof what === null) {
      return;
    }
    if (value !== undefined && what === undefined && useDefault === undefined) {
      throw Error(`no transform or default for field ${field} value "${value}"`);
    }
    if (typeof what === 'string') {
      newItem[field] = what;
    } else if (typeof what === 'function') {
      const found = what({ v: value, importItem });
      newItem[field] = found;
    } else if (typeof useDefault === 'function') {
      newItem[field] = useDefault(value);
    } else if (useDefault === true) {
      newItem[field] = value;
    }
  }
}
