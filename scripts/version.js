const fs = require('fs');

const from = process.argv[1];
const to = process.argv[2];

let fromStdIn = '';

console.log(`replacing '${from}' to '${to}'`);

process.stdin.on('data', (data) => fromStdIn = fromStdIn + data);
process.stdin.on('end', () => {
  fromStdIn.split('\n').map(line => {
    const content = fs.readFileSync(line).toString('utf8');
    fs.writeFileSync(line, content.replace(new RegExp(from.replace(new RegExp('\\.', 'g'), '\\.'), 'g'), to));
  });
});