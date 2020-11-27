const md = require('markdown-it')();

export function jiraToMd(what: string) {
  const j2m = what.replace(/^# /gm, '* ').replace(/^h\d\. /gm, (i) => ''.padEnd(parseInt(i.substr(1, 1), 10), '#') + ' ');
  return j2m;
}

export function jiraMdToAzboardsHTML(what: string) {
  const j2m = jiraToMd(what);

  const result = md.render(j2m);
  return result;
}