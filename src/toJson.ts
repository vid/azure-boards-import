const CSV = require('csv-js');
import { Tinputs, Tinput } from './import-workitems';

// convert a csv file to a json object, using an array for duplicate header values
export function toJson(input: string) {
  const rows = CSV.parse(input);
  const header = rows.shift();
  const res = rows.reduce((all: Tinputs, i: Tinput) => {
    const r = header.reduce((rall: Tinput, ri: string, k: number) => {
      let rval = i[k];
      if (rall[ri]) {
        if (Array.isArray(rall[ri])) {
          rval = [...rall[ri], i[k]];
        } else {
          rval = [rall[ri], i[k]];
        }
      }
      return { ...rall, [ri]: rval };
    }, {});
    return [...all, r];
  }, []);
  return res;
}
