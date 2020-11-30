import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { IConfig } from './IConfig';
import { toJson } from './toJson';
import { Transformer } from './transform';
import { Work } from './work';
import { TImportWorkItem, WorkItems } from './work-items';

export type Tinput = Partial<TImportWorkItem>;
export type Tinputs = Tinput[];

export const ISSUE_ID = 'Issue id';

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
export const azdoDate = (date) => (date as Date).toISOString();

// CAUTION
const RUN_DIR = './run';

process.on('unhandledRejection', up => { throw up })

export async function go(config: IConfig) {
    const workitems_file = config.workitems.file || 'sample/workitems.csv';

    const transformer = new Transformer(config.workitems);
    const workItems = new WorkItems(config);
    const work = new Work(config);
    const text = readFileSync(workitems_file, 'utf-8');

    let input = toJson(text);

    const remoteStateMap = await getOrWrite('workItemTypes', async () => await workItems.getWorkItemTypeMap());
    // const workItemFields = await getOrWrite('workItemFields', async () => await workItems.getFields());
    const teams = await getOrWrite('teams', async () => await workItems.getTeams());
    const team = await teams.find(t => t.name === config.auth.team);
    config.teamId = config.teamId || team?.id;
    if (!config.teamId) {
        throw Error(`cannot find team id from ${config.auth.team}`);
    }
    // FIXME create missing iterations. documentation seems very thin around this.
    // const iterations = await work.getTeamIterations(team);
    // console.log('i', config.teamId, team, iterations)
    /*
       static WorkItemClassificationNode CreateIteration(string TeamProjectName, string IterationName, DateTime? StartDate = null, DateTime? FinishDate = null, string ParentIterationPath = null)
    {
        WorkItemClassificationNode newIteration = new WorkItemClassificationNode();
        newIteration.Name = IterationName;

        if (StartDate != null && FinishDate != null)
        {
            newIteration.Attributes = new Dictionary<string, object>();
            newIteration.Attributes.Add("startDate", StartDate);
            newIteration.Attributes.Add("finishDate", FinishDate);
        }

        return WitClient.CreateOrUpdateClassificationNodeAsync(newIteration, TeamProjectName, TreeStructureGroup.Iterations, ParentIterationPath).Result;
    }

var newNode = CreateIteration(TeamProjectName, @"R2");
newNode = CreateIteration(TeamProjectName, @"R2.1", ParentIterationPath: @"R2");
newNode = CreateIteration(TeamProjectName, @"Ver1", new DateTime(2019, 1, 1), new DateTime(2019, 1, 7), @"R2\R2.1");
*/


    // const iteration = await workItems.createIteration('wtwwxxyixr', '');
    // delete iteration.path;
    // console.log('it', iteration)
    // work.createTeamIteration(team, iteration as any);
    // console.log('ic', config.teamId, iteration)


    if (config.workitems.limit) input = input.slice(-config.workitems.limit);
    if (config.workitems.only) input = [input[config.workitems.only - 2]];

    let { transformed, deferred, idMap } = transformInput(transformer, config.workitems.default_area, input, remoteStateMap);
    if (config.workitems.deleteAllFirst) await deleteImportedWorkItems(workItems, config.workitems.default_area);

    if (Object.keys(deferred).length > 0) {
        writeFileSync('./run/deferred.json', JSON.stringify(deferred, null, 2));
        console.info(`wrote ${deferred.length} to deferred.json in ${RUN_DIR}`);
    }

    if (config.workitems.doImport) {
        const errors = await doImport(workItems, transformed, idMap, config.workitems.people_mappings);
        if (errors.length > 0) {
            writeFileSync('./run/errors.json', JSON.stringify(errors, null, 2));
            console.error(`wrote ${errors.length} to errors.json in ${RUN_DIR}`);
        }
    }

    writeFileSync(`${RUN_DIR}/imported.json`, JSON.stringify({ transformed, idMap }, null, 2));
    console.info(`wrote ${transformed.length} to imported.json in ${RUN_DIR}`);
};


const transformInput = (transformer, default_area, input, remoteStateMap) => {
    const deferred = [];
    const transform = transformer.transform();
    const transformed = input.reduce((all: Tinputs, importItem: Tinput) => {
        const _id = importItem[ISSUE_ID];
        if (!_id) {
            throw Error(`no id ${JSON.stringify(importItem)}`);
        }
        const newItem: Tinput = { _id, '/fields/System.areaPath': default_area };
        transformer.addIdMapTag(newItem, 'Import ' + Date.now());

        Object.entries(importItem).forEach(([key, value], row) => {
            const what = transform[key];
            if (value !== undefined && what === undefined) {
                const s = JSON.stringify(value).replace(/"/g, '');
                if (s.length > 0) {
                    transformer.addUndefined(newItem, `[${key}]: ${s}`);
                }
            }
            if (typeof what === null) {
                return all;
            }
            if (typeof what === 'string') {
                newItem[what] = newItem[what] ? [...newItem[what], value] : value;
                return all;
            }
            if (typeof what === 'function') {
                // try {
                what({ v: value, importItem, newItem, remoteStateMap });
                // } catch (e) {
                //     console.error(`row ${row} field ${key}: ${e}\nvalue: ${value}\nnewItem: ${JSON.stringify(newItem, null, 2)}`);
                //     throw (e);
                // }
            }
        });
        if (newItem._defer) {
            deferred.push(newItem);
            return all;
        }
        return [...all, newItem];
    }, []);
    return { transformed, deferred, idMap: transformer.idMap };
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
        if (idMap[importingId]) {
            idMap[importingId].importId = importedId;
            idMap[importingId].url = url;
        }
        item._importedId = importedId;
        if (!created) {
            console.error('did not create');
            process.exit(1);
        }
        const { comments, tags } = idMap[importingId];
        if (comments?.length > 0) {
            const sorted = comments.sort((a, b) => a.date - b.date);

            for (const mc of sorted) {
                const { date, who, comment: text } = mc;
                const ChangedDate = azdoDate(date);
                const ChangedBy = getPerson(who, peopleMappings);

                const res = await wi.addComment({ text, ChangedBy, ChangedDate }, created);
                console.info('comment', res.id);
            }
        }
        if (tags?.length > 0) {
            const res = await wi.addTags(tags, created);
            console.log('added tags', tags, res.id);
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
            console.info(`assigned parentId ${parentURL} to ${id}`, res.id)
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

async function deleteImportedWorkItems(wi, area) {
    const res = await wi.find(area);
    console.log('getting import delete candidates');
    const cis = await wi.getWorkItems(res.workItems.map(r => r.id));
    const wis = cis.filter(w => w.fields['System.Title'].match(/\(SIC-\d+\)$/)).map(w => w.id);
    console.info('deleting workitems:', wis);
    for (const r of wis) {
        console.info('delete', r);
        try {
            await wi.delete(r);
        } catch (e) {
            console.error(e);
        }
    }
}
