# azure-boards-import

Import to Azure Boards from a csv file

Parts adapted from https://github.com/danhellem/github-actions-issue-to-work-item

A file called config.ts should look like this:


```
const config = {
  orgUrl: 'https://dev.azure.com/${yourorg/',
  project: '${yourProject}',
  adoToken: '${yourAdoToken}',

  type_mappings: {
    Story: 'User Story'
  },

  state_mappings: {
    'To Do': 'New',
    Done: 'Done'
  },

  people_mappings: {

  },

  default_area : '${yourProject}\\${yourDefaultBoard}'
}


export default config;
```

Practically speaking, transform will probably have to be modified for a particular project too.