const http = require('http');

const port = process.env.PORT || 3000;
const env = process.env.ENV || 'dev';

function generateData(nbr) {
    const items = [];
    for (let i = 0; i < nbr; i++) {
        items.push(Math.floor((Math.random() * 100) + 100));
    }
    return items;
}

const datas = {
    'dev': generateData(5),
    'preprod': generateData(10),
    'prod': generateData(100),
};

const transformers = {
    'consumer': data => ({label: 'raw values for consumer', caller: 'consumer', env: env, values: data}),
    'partner': data => ({label: 'tuned values for privileged partner', caller: 'partner', env: env, values: data.map(v => v + 100)}),
    'none': _ => ({error: 'unknown caller'}),
};

const requestHandler = (request, response) => {
    const caller = request.headers['X-Caller-Key'] || request.headers['x-caller-key'] || 'none';
    const data = datas[env] || [];
    const transformer = transformers[caller] || ((data) => ({error: `bad caller ${caller}`}));
    response.writeHead(200, {'Content-Type': 'application/json', 'X-Caller-Was': caller});
    response.write(JSON.stringify(transformer(data)));
    response.end();
};

const server = http.createServer(requestHandler);
server.listen(port, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`API ${env} is listening on ${port}`)
});