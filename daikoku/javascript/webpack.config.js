const path = require('path');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  const config = {
    mode: isProd ? 'production' : 'development',
    devServer: {
      hot: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
      }
    },
    entry: {
      'daikoku.login': path.resolve(__dirname, 'src/login.tsx'),
      'daikoku.home': path.resolve(__dirname, 'src/home.tsx'),
      daikoku: path.resolve(__dirname, 'src/index.tsx'),
    },
    module: {
      rules: [{
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: 'ts-loader'
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
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
        test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      {
        test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
              mimetype: 'application/font-woff'
            },
          },
        ],
      },
      {
        test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      {
        test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      {
        test: /\.gif$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      {
        test: /\.png$/,
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 1,
            },
          },
        ],
      },
      ]
    },
    output: {
      filename: isProd ? '[name].min.js' : '[name].js',
      path: path.resolve(__dirname, '../public/react-app'),
      publicPath: isProd ? '/assets/react-app/' : 'http://localhost:3000/',
      library: 'Daikoku',
      libraryTarget: 'umd'
    },

    plugins: [
      // new BundleAnalyzerPlugin(),
      new MiniCssExtractPlugin({
        filename: isProd ? '[name].min.css' : '[name].css',
        chunkFilename: isProd ? '[id].min.css' : '[id].css'
      })
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        crypto: 'crypto-browserify',
        path: 'path-browserify',
      },
      fallback: {
        buffer: require.resolve('buffer/'),
        stream: require.resolve("stream-browserify")
      }
    }
  };
  if (isProd) {
    return {
      ...config,
      plugins: [
        ...config.plugins,
        new CompressionPlugin(),
        new MiniCssExtractPlugin()
      ],
      optimization: {
        minimize: true,
        minimizer: [
          new TerserJSPlugin({
            parallel: true
          }),
          new CssMinimizerPlugin()
        ],
      }
    };
  } else {
    return {
      ...config,
      plugins: [
        ...config.plugins
      ],
      devtool: 'eval'
    };
  }
};