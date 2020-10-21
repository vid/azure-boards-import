import { jiraDateToADate, TtransformFunc } from './import-workitems';

// keys that exist will replace input key
// field list https://docs.microsoft.com/en-us/azure/devops/boards/work-items/guidance/work-item-field?view=azure-devops

export function transformer({ type_mappings, state_mappings, people_mappings }): TtransformFunc {
  const aPeopleFinder = (field) => (ctx) => getValue(field, people_mappings, ctx, v => `${v}@proj`);
  return {
    "Issue Type": (ctx) => getValue('_workItemType', type_mappings, ctx, true),
    Summary: ({ v, importItem, newItem }) => newItem['/fields/System.Title'] = `${(v as string).substr(0, 250)} (${importItem['Issue key']})`,
    // "Priority": '/fields/System.Priority',
    Created: ({ v, newItem }) => newItem['/fields/System.CreatedDate'] = jiraDateToADate(v),
    // "Resolved": '/fields/System.ClosedDate',
    Description: '/fields/System.Description',
    Status: (ctx) => getValue('/fields/System.State', state_mappings, ctx, true),
    Comment: '_comments',

    Sprint: undefined,
    Assignee: aPeopleFinder('/fields/System.AssignedTo'),
    Reporter: aPeopleFinder('/fields/System.CreatedBy'),
    "Creator": '_creator',
    "Updated": '_creator',
    "Due date": '_creator',
    "Watchers": '_creator',
    "Attachment": '_creator',

    "Issue key": null,
    "Issue id": null,
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
    "Custom field (Start date)": undefined,
    "Custom field (Story point estimate)": null,
    "Custom field (Supplemental Guidance)": null,
    "Custom field (Title)": null,
    "Parent": null,
    "Parent summary": null,
    "Status Category": null
  }
}

function getValue(field, map, { v: value, importItem, newItem }, useDefault: ((v) => string) | boolean) {
  let what = map[value];
  if (typeof what === null) {
    return;
  }
  if (value !== undefined && what === undefined && useDefault === undefined) {
    console.error(`no transform or default for field ${field} value "${value}"`);
    return;
  }
  if (typeof what === 'string') {
    newItem[field] = what;
  }
  if (typeof what === 'function') {
    const found = what({ v: value, importItem });
    newItem[field] = found;
  }
  if (typeof useDefault === 'function') {
    newItem[field] = useDefault(value);
  } else if (useDefault === true) {
    console.log('fi', field, value)
    newItem[field] = value;
  }
}
