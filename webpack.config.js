/* global module, __dirname */
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './index.js',
  output: {
    filename: 'eyeson-factory.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'eyeson-factory',
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)|(dist)|(scripts)|(__mocks__)/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      },
    ]
  }
};
