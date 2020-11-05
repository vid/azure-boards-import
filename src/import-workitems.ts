import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { IConfig } from './IConfig';
import { toJson } from './toJson';
import { transformer } from './transform';
import { TImportWorkItem, WorkItems } from './work-items';

export type Tinput = Partial<TImportWorkItem>;
export type Tinputs = Tinput[];

export type TTransformContext = {
    v: string | string[] | { rel: string },
    importItem: Tinput,
    newItem: Partial<TImportWorkItem>,
    remoteStateMap: { [name: string]: string[] }
}

type transformer = (c: TTransformContext) => void;
type Ttransformed = transformer | string | undefined | null

export interface TtransformFunc {
    [key: string]: Ttransformed
}

export const jiraDateToADate = (date) => date && new Date(date).toISOString();

const RUN_DIR = './run';

export async function go(config: IConfig) {
    const workitems_file = config.workitems.file || 'sample/workitems.csv';

    const transform = transformer(config.workitems);
    const wi = new WorkItems(config);
    const text = readFileSync(workitems_file, 'utf-8');

    let input = toJson(text);

    const transformInput = (input, remoteStateMap) => {
        const deferred = [];
        const transformed = input.reduce((all: Tinputs, importItem: Tinput) => {
            const newItem: Tinput = { '/fields/System.areaPath': config.workitems.default_area, '/fields/System.Tags': 'Import ' + Date.now(), _comments: [] };

            Object.entries(importItem).forEach(([key, value], row) => {
                const what = transform[key];
                if (value !== undefined && what === undefined) {
                    console.error(`no transform for ${key} with "${value}"`);
                    return all;
                }
                if (typeof what === null) {
                    return all;
                }
                if (typeof what === 'string') {
                    newItem[what] = newItem[what] ? [...newItem[what], value] : value;
                    return all;
                }
                if (typeof what === 'function') {
                    try {
                        what({ v: value, importItem, newItem, remoteStateMap });
                    } catch (e) {
                        console.error(`row ${row} field ${key}: ${e}\nvalue: ${value}\nnewItem: ${JSON.stringify(newItem, null, 2)}`);
                        throw (e);
                    }
                }
            });
            if (newItem._defer) {
                deferred.push(newItem);
                return all;
            }
            return [...all, newItem];
        }, []);
        return { transformed, deferred };
    }
    async function doImport(incoming: Tinputs) {
        for (const item of incoming) {
            if (!item) {
                continue;
            }
            item['/fields/System.ChangedDate'] = item['/fields/System.CreatedDate']
            const created = await wi.create(item as TImportWorkItem);
            console.log('created', created.id, created.fields['System.Title']);
            if (!created) {
                console.error('did not create');
                process.exit(1);
            }
            if (item._comments.length > 0) {
                for (const comment of item._comments) {
                    if (comment.length < 1) {
                        continue;
                    }
                    const [date, who, ...rest] = comment.split(';');
                    const text = rest.join(';');
                    const ChangedDate = jiraDateToADate(date);
                    const ChangedBy = `${who}@proj`;

                    const res = await wi.comment({ text, ChangedBy, ChangedDate }, created);
                    console.info('comment', res.id);
                }
            }
        }
    }

    const remoteStateMap = await getOrWrite('workItemTypes', async () => await wi.getWorkItemTypeMap());
    const workItemFields = await getOrWrite('workItemFields', async () => await wi.getFields());

    await deleteAllWorkItems(wi);

    if (config.workitems.limit) input = input.slice(-config.workitems.limit);
    if (config.workitems.only) input = [input[config.workitems.only]];
    let { transformed, deferred } = transformInput(input, remoteStateMap);
    if (Object.keys(deferred).length > 0) {
        writeFileSync('./run/deferred.json', JSON.stringify(deferred, null, 2));
        console.info(`wrote ${deferred.length} deferred.json to ${RUN_DIR}`, deferred);
    }

    await doImport(transformed);
    writeFileSync(`${RUN_DIR}/imported.json`, JSON.stringify(transformed, null, 2));
    console.info(`wrote ${transformed.length} imported.json to ${RUN_DIR}`);
};

async function getOrWrite(fn, creator) {
    let results;
    try {
        results = JSON.parse(readFileSync(`${RUN_DIR}/${fn}.json`, 'utf-8'));
    } catch (e) {
        console.info(`getting ${fn}`);
        try {
            results = await creator();
            if (!existsSync(RUN_DIR)) {
                console.info(`mkdir ${RUN_DIR}`);
                mkdirSync(RUN_DIR);
            }
            writeFileSync(`${RUN_DIR}/${fn}.json`, JSON.stringify(results, null, 2));
        } catch (e2) {
            throw Error(`cannot retrieve or write workItemTypes ${e2}`);
        }
    }
    return results;
}

async function deleteAllWorkItems(wi) {
    const res = await wi.find();
    console.log('board workitems:', res.workItems.map(r => r.id));
    for (const r of res.workItems) {
        console.log('delete', r);
        try {
            await wi.delete(r.id);
        } catch (e) {
            console.error(e);
        }
    }
}