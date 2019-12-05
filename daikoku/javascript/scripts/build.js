const Bundler = require('parcel-bundler');
const Path = require('path');

process.env.NODE_ENV = 'production';
process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const entryFiles = Path.join(__dirname, '../src/index.js');

const options = {
  minify: true,
  cache: true,
  sourceMaps: true,
  autoinstall: true,
  contentHash: true,
  outFile: 'dist/daikoku.min.js',
  global: 'Daikoku',
  production: true,
  throwErrors: false,
  scopeHoist: false,
  target: 'browser' 
};

const bundler = new Bundler(entryFiles, options);
bundler.bundle();