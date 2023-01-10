module.exports = (api) => {
  api.cache.using(() => process.env.NODE_ENV);
  return {
    presets: [
      '@babel/preset-env',
      ['@babel/preset-react', { development: !api.env('production'), runtime: 'classic' }]
    ],
    plugins: [
      '@babel/plugin-syntax-dynamic-import',
      [
        '@babel/plugin-proposal-class-properties',
        {
          'loose': false
        }
      ],
    ]
  };
};