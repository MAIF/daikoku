const path = require('path');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const SpeedMeasurePlugin = require('speed-measure-webpack-plugin');

const smp = new SpeedMeasurePlugin();

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  const config = {
    entry: {
      'daikoku.login': path.resolve(__dirname, 'src/login.js'),
      'daikoku.home': path.resolve(__dirname, 'src/home.js'),
      daikoku: path.resolve(__dirname, 'src/index.js'),
    },
    output: {
      filename: isProd ? '[name].min.js' : '[name].js',
      path: path.resolve(__dirname, '../public/react-app'),
      publicPath: isProd ? '/assets/react-app/' : 'http://localhost:3000/',
      library: 'Daikoku',
      libraryTarget: 'umd'
    },
    module: {
      rules: [{
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'babel-loader'
        },
        {
          test: /\.css$/,
          use: [{
              loader: MiniCssExtractPlugin.loader,
            },
            'css-loader'
          ]
        },
        {
          test: /\.scss$/,
          use: [
            'style-loader', // creates style nodes from JS strings
            'css-loader', // translates CSS into CommonJS
            'sass-loader' // compiles Sass to CSS, using Node Sass by default
          ]
        },
        {
          test: /\.less$/,
          use: [
            'style-loader', // creates style nodes from JS strings
            'css-loader', // translates CSS into CommonJS
            'less-loader' // compiles less to CSS, using less by default
          ]
        },
        {
          test: /\.gif$/,
          loader: 'url-loader?limit=1&name=[name]/.[ext]'
        },
        {
          test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
        {
          test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader?limit=10000&mimetype=application/font-woff&name=[name]/[name].[ext]'
        },
        {
          test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
        {
          test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
        {
          test: /\.gif$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
        {
          test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
        {
          test: /\.png$/,
          loader: 'url-loader?limit=1&name=[name]/[name].[ext]'
        },
      ]
    },
    devServer: {
      disableHostCheck: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
      }
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: isProd ? '[name].min.css' : '[name].css',
        chunkFilename: isProd ? '[id].min.css' : '[id].css'
      }),
    ]
  };
  if (isProd) {
    return smp.wrap({ 
      ...config, 
      optimization: {
        minimize: true,
        minimizer: [
          new TerserJSPlugin({
            parallel: true,
            cache: true
          }),
          new OptimizeCSSAssetsPlugin({})
        ],
      }
    });
  } else {
    return config;
  }
};

/*

minimizer: [
  new TerserJSPlugin({
    parallel: true,
    cache: true
  }), 
  new OptimizeCSSAssetsPlugin({})
],

minimizer: [
  new UglifyJsPlugin({
    cache: true,
    parallel: true,
  }),
  new OptimizeCSSAssetsPlugin({})
],
*/