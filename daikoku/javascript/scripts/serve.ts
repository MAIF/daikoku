// @ts-expect-error TS(2451): Cannot redeclare block-scoped variable 'Bundler'.
const Bundler = require('parcel-bundler');
// @ts-expect-error TS(2451): Cannot redeclare block-scoped variable 'Path'.
const Path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

// @ts-expect-error TS(2451): Cannot redeclare block-scoped variable 'entryFiles... Remove this comment to see the full error message
const entryFiles = Path.join(__dirname, '../src/index.js');

const actualOptions = {
  watch: true,
  hmr: true,
  cache: true,
  sourceMaps: true,
  autoinstall: true,
  outFile: 'daikoku.js',
  port: 3000,
  global: 'Daikoku',
  throwErrors: false,
  scopeHoist: false,
  target: 'browser' 
};

(async function() {
  const bundler = new Bundler(entryFiles, actualOptions);
  bundler.on('buildEnd', () => {
    bundler.emit('reloadBrowsers');
    bundler.hmr.broadcast({
      type: 'reload'
    });
  });
  const bundle = await bundler.serve(3000, false, '0.0.0.0');
})();