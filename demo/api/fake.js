const http = require('http');

const port = process.env.PORT || 3000;

function generateData(nbr) {
  const items = [];
  for (let i = 0; i < nbr; i++) {
    items.push(Math.floor((Math.random() * 100) + 100));
  }
  return items;
}

const requestHandler = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.write(JSON.stringify(generateData(200)));
  response.end();
};

const server = http.createServer(requestHandler);
server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log(`Fake api is listening on ${port}`)
});