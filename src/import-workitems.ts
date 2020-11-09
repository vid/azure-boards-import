import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { IConfig } from './IConfig';
import { toJson } from './toJson';
import { transformer } from './transform';
import { Work } from './work';
import { TImportWorkItem, WorkItems } from './work-items';

export type Tinput = Partial<TImportWorkItem>;
export type Tinputs = Tinput[];

export type TTransformContext = {
    v: string | string[] | { rel: string },
    importItem: Tinput,
    newItem: Partial<TImportWorkItem>,
    remoteStateMap: { [name: string]: string[] },
    idMap: { [id: number]: { key: string, importID?: number, comments: [] } }
}

type transformer = (c: TTransformContext) => void;
type Ttransformed = transformer | string | undefined | null

export interface TtransformFunc {
    [key: string]: Ttransformed
}

export const jiraDateToADate = (date) => date && new Date(date).toISOString();

// CAUTION
const DELETE_ALL_FIRST = false;
const DO_IMPORT = false;

const RUN_DIR = './run';

export async function go(config: IConfig) {
    const workitems_file = config.workitems.file || 'sample/workitems.csv';

    const transform = transformer(config.workitems);
    const workItems = new WorkItems(config);
    const work = new Work(config);
    const text = readFileSync(workitems_file, 'utf-8');

    let input = toJson(text);

    const remoteStateMap = await getOrWrite('workItemTypes', async () => await workItems.getWorkItemTypeMap());
    const workItemFields = await getOrWrite('workItemFields', async () => await workItems.getFields());
    const teams = await getOrWrite('teams', async () => await workItems.getTeams());
    config.teamId = config.teamId || teams.find(t => t.name === config.auth.team)?.id;
    if (!config.teamId) {
        throw Error(`cannot find team id from ${config.auth.team}`);
    }
    const iterations = await work.getTeamIterations(teamId);

    if (DELETE_ALL_FIRST) await deleteAllWorkItems(workItems);

    if (config.workitems.limit) input = input.slice(-config.workitems.limit);
    if (config.workitems.only) input = [input[config.workitems.only]];

    let { transformed, deferred, idMap } = transformInput(transform, config.workitems.default_area, input, remoteStateMap);

    if (Object.keys(deferred).length > 0) {
        writeFileSync('./run/deferred.json', JSON.stringify(deferred, null, 2));
        console.info(`wrote ${deferred.length} to deferred.json in ${RUN_DIR}`);
    }

    if (DO_IMPORT) {
        const errors = await doImport(workItems, transformed, idMap, config.workitems.people_mappings);
        if (errors.length > 0) {
            writeFileSync('./run/errors.json', JSON.stringify(errors, null, 2));
            console.error(`wrote ${errors.length} to errors.json in ${RUN_DIR}`);
        }
    }

    writeFileSync(`${RUN_DIR}/imported.json`, JSON.stringify(transformed, null, 2));
    console.info(`wrote ${transformed.length} to imported.json in ${RUN_DIR}`);
};


const transformInput = (transform, default_area, input, remoteStateMap) => {
    const deferred = [];
    const idMap = {};
    const transformed = input.reduce((all: Tinputs, importItem: Tinput) => {
        const newItem: Tinput = { '/fields/System.areaPath': default_area, '/fields/System.Tags': 'Import ' + Date.now() };

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
                    what({ v: value, importItem, newItem, remoteStateMap, idMap });
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
    return { transformed, deferred, idMap };
}

async function doImport(wi: WorkItems, incoming, idMap, peopleMappings) {
    const errors = [];
    for (const item of incoming) {
        if (!item) {
            continue;
        }
        item['/fields/System.ChangedDate'] = item['/fields/System.CreatedDate']
        const created = await wi.create(item as TImportWorkItem);
        const importingId = item._id;
        const { id: importedId, url } = created;
        console.info('created', importedId, created.fields['System.Title']);
        idMap[importingId].importId = importedId;
        idMap[importingId].url = url;
        item._importedId = importedId;
        if (!created) {
            console.error('did not create');
            process.exit(1);
        }
        const comments = idMap[importingId].comments;
        if (comments.length > 0) {
            for (const comment of comments) {
                if (comment.length < 1) {
                    continue;
                }
                const [date, who, ...rest] = comment.split(';');
                const text = rest.join(';');
                const ChangedDate = jiraDateToADate(date);
                const ChangedBy = getPerson(who, peopleMappings);

                const res = await wi.comment({ text, ChangedBy, ChangedDate }, created);
                console.info('comment', res.id);
            }
        }
    }
    for (const item of incoming) {
        if (!item) {
            continue;
        }
        if (item._parent) {
            const id = item._importedId;
            const parentURL = idMap[item._parent]?.url;
            if (!parentURL) {
                errors.push(`missing parent ${item._parent} for ${id}`);
                continue;
            }
            const res = await wi.addParent({ url: parentURL }, { id });
            console.info(`assigned parentId ${parentURL} to ${id}`, res)
        }
    }
    return errors;
}

export function getPerson(iId, peopleMappings) {
    return peopleMappings[iId] || `${iId}@proj`;
}

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
    console.info('deleting workitems:', res.workItems.map(r => r.id));
    for (const r of res.workItems) {
        console.info('delete', r);
        try {
            await wi.delete(r.id);
        } catch (e) {
            console.error(e);
        }
    }
}
