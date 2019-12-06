const fs = require('fs');
const path = require('path');

const xargs = true;
const from = process.argv[2];
const to = process.argv[3];

console.log(`\nreplacing '${from}' to '${to}' on :\n`);

if (xargs) {
  const files = process.argv.slice(4);
  files.map(line => path.join(process.cwd(), line)).filter(fp => fs.existsSync(fp)).filter(fp => fs.statSync(fp).isFile()).map(fullPath => {
    console.log(` * ${fullPath}`);
    const content = fs.readFileSync(fullPath).toString('utf8');
    fs.writeFileSync(fullPath, content.replace(new RegExp(from.replace(new RegExp('\\.', 'g'), '\\.'), 'g'), to));
  });
  console.log('')
} else {
  let fromStdIn = '';
  process.stdin.on('data', (data) => fromStdIn = fromStdIn + data);
  process.stdin.on('end', () => {
    fromStdIn.split('\n').map(line => path.join(process.cwd(), line)).filter(fp => fs.existsSync(fp)).filter(fp => fs.statSync(fp).isFile()).map(fullPath => {
      console.log(` * ${fullPath}`);
      const content = fs.readFileSync(fullPath).toString('utf8');
      fs.writeFileSync(fullPath, content.replace(new RegExp(from.replace(new RegExp('\\.', 'g'), '\\.'), 'g'), to));
    });
    console.log('')
  });
}
