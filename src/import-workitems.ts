import { toJson } from './toJson';
import { transformer } from './transform';
import { TImportWorkItem, WI } from './workItems';

import config  from '../config';
const { adoToken, project, orgUrl, default_area, type_mappings, state_mappings, people_mappings } = config;
const import_file = (config as any).import_file || 'import.csv';

const transform = transformer({ type_mappings, state_mappings, people_mappings });
const wi = new WI({ adoToken, project, orgUrl, bypassRules: true });
const text = require('fs').readFileSync(import_file, 'utf-8');
let input = toJson(text);

export type Tinput = Partial<TImportWorkItem>;
export type Tinputs = Tinput[];

export type TTransformContext = {
    v: string | string[] | { rel: string },
    importItem: Tinput,
    newItem: Partial<TImportWorkItem>
}

type transformer = (c: TTransformContext) => void;
type Ttransformed = transformer | string | undefined | null

export interface TtransformFunc {
    [key: string]: Ttransformed
}

if (true) input = [input[1]]
export const jiraDateToADate = (date) => new Date(date).toISOString();

const incoming = input.reduce((all: Tinputs, importItem: Tinput) => {
    const newItem: Tinput = { '/fields/System.areaPath': default_area, '/fields/System.Tags': 'Import ' + Date.now() };

    Object.entries(importItem).forEach(([key, value]) => {
        const what = transform[key];
        if (value !== undefined && what === undefined) {
            console.error(`no transform for ${key} with "${value}"`);
            return all;
        }
        if (typeof what === null) {
            return all;
        }
        if (typeof what === 'string') {
            newItem[what] = value;
            return all;
        }
        if (typeof what === 'function') {
            what({ v: value, importItem, newItem });
        }
    });
    return [...all, newItem];
}, []);

go(incoming);

async function go(incoming: Tinputs) {
    /*
    const wit = await getWorkItemTypes();
    console.log('workitem attributes:', wit.map(w => w.name))
    const update = await wi.updateWorkItem([{
        "op": "replace",
        "path": "/fields/System.State",
        "value": "Resolved"
    }],  44);
    console.log('update', update)
    const fields = await wi.getFields();
    console.log('fields', fields.map(f => [f.name, f.referenceName]), 'state', fields.find(f => f.name === 'State'))
    const ff = await wi.getWorkItems([44]);
    console.log('ff', ff)
    */
    await doImport(incoming);
};
async function doImport(incoming: Tinputs) {
    for (const item of incoming) {
        item['/fields/System.ChangedDate'] = item['/fields/System.CreatedDate']
        const created = await wi.create(item as TImportWorkItem);
        console.log('cc', created.id, created.fields['System.Title']);
        if (!created) {
            console.error('did not create');
            process.exit(1);
        }
        const ff = await wi.getWorkItems([created.id]);
        console.log('created', ff)
        if (item._comments) {
            for (const comment of item._comments) {
                if (comment.length < 1) {
                    continue;
                }
                const [date, who, ...rest] = comment.split(';');
                const text = rest.join(';');
                const ChangedDate = jiraDateToADate(date);
                const ChangedBy = `${who}@proj`;
                console.log('xx', ChangedDate)

                const res = await wi.comment({ text, ChangedBy, ChangedDate }, created);
                console.log('comment', comment, res);
            }
        }
    }
    // const del = await wi.delete(created.id)
    // console.log('del', del);
    const res = await wi.find();
    console.log(res.workItems.map(r => r.id));
}

async function getWorkItemTypes() {
    const relations = await wi.relations();
    return relations;
}
