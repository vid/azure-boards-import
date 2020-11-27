import { jiraToMd, jiraMdToAzboardsHTML } from './jira-md-transformer';

it('transforms jira to md', () => {
  const input = `h1. hi\nh2. there\n# point\n# point\nh3. eh`;
  const j = jiraToMd(input);
  expect(j).toEqual(`# hi\n## there\n* point\n* point\n### eh`);
});

it('transforms jira to html', () => {
  const input = `h1. hi\nh2. there\nh3. eh`;
  const j = jiraMdToAzboardsHTML(input);
  expect(j).toEqual(`<h1>hi</h1>\n<h2>there</h2>\n<h3>eh</h3>\n`);
});