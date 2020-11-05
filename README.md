# azure-boards-import

Import to Azure Boards from a csv file

Parts adapted from https://github.com/danhellem/github-actions-issue-to-work-item

Download your Jira issues to a csv file indicated in `workitems`, and populate the `wikis` with .md files.

A file called config.ts should conform to src/IConfig.ts

To run it, use `ts-node src/import-all.ts`.

See the IConfig for a better description of these values.

In many cases, src/transform.ts will have to be modified for a particular project too.