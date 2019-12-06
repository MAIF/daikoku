const fs = require('fs');
const path = require('path');

const from = process.argv[2];
const to = process.argv[3];

let fromStdIn = '';

console.log(`\nreplacing '${from}' to '${to}' on :\n`);

process.stdin.on('data', (data) => fromStdIn = fromStdIn + data);
process.stdin.on('end', () => {
  fromStdIn.split('\n').map(line => path.join(process.cwd(), line)).filter(fp => fs.existsSync(fp)).filter(fp => fs.statSync(fp).isFile()).map(fullPath => {
    console.log(` * ${fullPath}`);
    const content = fs.readFileSync(fullPath).toString('utf8');
    fs.writeFileSync(fullPath, content.replace(new RegExp(from.replace(new RegExp('\\.', 'g'), '\\.'), 'g'), to));
  });
  console.log('')
});