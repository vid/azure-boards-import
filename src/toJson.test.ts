const {toJson} = require('./toJson');

it('handles csv with multiple values for a header', () => {
  const input = `one,two,two,two\na,b,c,d`
  const j = toJson(input);
  expect(j).toEqual([{one: 'a', two: ['b', 'c', 'd']}]);
});