import { IWorkitems } from './IConfig';
import { getPerson, jiraDateToADate, TTransformContext, TtransformFunc } from './import-workitems';
import { FVC } from './work-items';

// keys that exist will replace input key
// field list https://docs.microsoft.com/en-us/azure/devops/boards/work-items/guidance/work-item-field?view=azure-devops

export function transformer(wconfig: IWorkitems): TtransformFunc {
  const aPeopleFinder = (field) => ({ newItem, v }: TTransformContext) => {
    const person = getPerson(v, wconfig.people_mappings);
    newItem[field] = person;
  };
  const map = (idMap, importItem, what) => {
    const id = importItem['Issue id'];
    let c = idMap[id] || { comments: [] };
    c = { ...c, ...what };
    idMap[id] = c;
  }
  const addMapComment = (idMap, importItem, comment) => {
    if (!comment || comment.length < 1) {
      return;
    }
    const id = importItem['Issue id'];
    if (!idMap[id]) {
      throw Error(`Missing ${id} ${JSON.stringify({ importItem }, null, 2)}`)
    }
    let comments: string[] = idMap[id].comments;
    if (Array.isArray(comment)) {
      comments = comments.concat(comment);
    } else {
      comments.push(comment);
    }
    map(idMap, importItem, { comments });
  }
  return {
    "Issue id": ({ idMap, newItem, v, importItem }) => {
      const id = parseInt(v as string, 10);
      newItem._id = id;
      return map(idMap, importItem, { key: importItem['Issue key'] })
    },
    "Issue Type": (ctx) => setType(ctx, wconfig.type_mappings),
    Summary: ({ v, importItem, newItem, idMap }) => {
      newItem['/fields/System.Title'] = `${(v as string).substr(0, 240)} (${importItem['Issue key']})`;
      if ((v as string).length > 240) {
        addMapComment(idMap, importItem, `${jiraDateToADate(Date.now())};import; Title truncated from "${v}"`);
      }
    },
    Created: ({ v, newItem }) => newItem['/fields/System.CreatedDate'] = jiraDateToADate(v),
    Resolved: ({ v, newItem }) => newItem[`${FVC}ClosedDate`] = jiraDateToADate(v),
    "Custom field (Start date)": ({ v, newItem }) => newItem[`${FVC}StartDate`] = jiraDateToADate(v),
    Description: '/fields/System.Description',
    Status: (ctx) => getStatus(ctx, wconfig.state_mappings, wconfig.defer_types),
    Comment: ({ idMap, importItem, v }) => addMapComment(idMap, importItem, v),
    Assignee: aPeopleFinder('/fields/System.AssignedTo'),
    Priority: ctx => setPriority(ctx, wconfig.priorities),
    Creator: aPeopleFinder('/fields/System.CreatedBy'),
    'Due date': `${FVC}Due Date`,

    Reporter: undefined,
    Updated: undefined,
    Watchers: undefined,
    Attachment: undefined,

    Sprint: `/fields/System.Iteration ID`,
    Parent: '_parent',

    "Issue key": null,
    "Project key": null,
    "Project name": null,
    "Project type": null,
    "Project lead": null,
    "Project description": null,
    "Resolution": null,
    "Last Viewed": null,
    "Votes": null,
    "Environment": null,
    "Original Estimate": null,
    "Remaining Estimate": null,
    "Time Spent": null,
    "Work Ratio": null,
    "Σ Original Estimate": null,
    "Σ Remaining Estimate": null,
    "Σ Time Spent": null,
    "Security Level": null,
    "Outward issue link (Blocks)": null,
    "Outward issue link (Relates)": null,
    "Custom field (Class)": null,
    "Custom field (Definition)": null,
    "Custom field (ID)": null,
    "Custom field (Impact)": null,
    "Custom field (Issue color)": null,
    "Custom field (Mitigation)": null,
    "Custom field (Name)": null,
    "Custom field (Probability)": null,
    "Custom field (Rank)": null,
    "Custom field (Story point estimate)": null,
    "Custom field (Supplemental Guidance)": null,
    "Custom field (Title)": null,
    "Parent summary": null,
    "Status Category": null
  }
}

function setPriority(ctx, priority_mapping) {
  const pi = priority_mapping[ctx.v];
  if (pi === undefined) {
    throw Error(`unknown priority ${ctx.v}`)
  }
  ctx.newItem[`${FVC}Priority`] = pi;
}

function setType(ctx, type_mappings) {
  setValue('_workItemType', type_mappings, ctx, true);
}

function getStatus(ctx: TTransformContext, state_mappings, defer_types) {
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

function setValue(field, map, { v: value, importItem, newItem }, useDefault: ((v) => string) | boolean) {
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
