import * as importWorkitems from './import-workitems';
import * as importWikis from './import-wikis';

const config = JSON.parse(require('fs').readFileSync('./config.json', 'utf-8'));
importWorkitems.go(config);
importWikis.go(config);
