import webpack from 'webpack';
import { VueLoaderPlugin } from 'vue-loader';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, readFile, writeFile } from 'node:fs/promises';
const card = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(card, '..');
const source = path.join(card, 'src/角色卡玩法规则包/界面/人物与宝物');
const output = path.join(root, 'dist/角色卡玩法规则包/界面/人物与宝物');
const config = {
  mode: 'production',
  target: ['web', 'es2022'],
  devtool: false,
  entry: path.join(source, 'index.ts'),
  output: { path: output, filename: 'app.js', clean: true },
  resolve: { extensions: ['.ts', '.js', '.vue'], alias: { vue: 'vue/dist/vue.runtime.esm-bundler.js' } },
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          appendTsSuffixTo: [/\.vue$/],
          onlyCompileBundledFiles: true,
          configFile: path.join(root, 'tsconfig.json'),
        },
      },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }] },
    ],
  },
  plugins: [
    new VueLoaderPlugin(),
    new MiniCssExtractPlugin({ filename: 'style.css' }),
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    }),
    new HtmlWebpackPlugin({
      templateContent:
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>赛琉弥斯 · 人物与宝物</title></head><body><div id="treasure-ui"></div></body></html>',
    }),
  ],
  performance: { hints: false },
};
const compiler = webpack(config);
compiler.run(async (error, stats) => {
  try {
    if (error || stats?.hasErrors()) throw error ?? new Error(stats.toString({ all: false, errors: true }));
    const stylesheet = path.join(output, 'style.css');
    await writeFile(stylesheet, (await readFile(stylesheet, 'utf8')).trimEnd() + '\n');
    await cp(path.join(source, 'assets'), path.join(output, 'assets'), {
      recursive: true,
      filter: assetPath => !/\.(png|jpe?g)$/i.test(assetPath) && path.basename(assetPath) !== '.gitignore',
    });
    console.log(stats.toString({ all: false, assets: true, warnings: true }));
    console.log(`UI output: ${output}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    compiler.close(() => {});
  }
});
