# azure-boards-import

Import to Azure Boards from a csv file

Parts adapted from https://github.com/danhellem/github-actions-issue-to-work-item

A file called config.json should look like this:


```
{
  "org": "<org>",
  "project": "<proj>",
  "adoToken": "<token>",
  "workitems": "import/workitems.csv",
  "wikis": "import/wikis",
  "type_mappings": {
    "Story": "User Story"
  },
  "state_mappings": {
    "To Do": "New",
    "Done": "Done"
  },
  "people_mappings": {},
  "default_area": "<project>\\Development",
  debug: false
}

```

See the IConfig for a better description of these values.

In many cases, src/transform.ts will have to be modified for a particular project too.