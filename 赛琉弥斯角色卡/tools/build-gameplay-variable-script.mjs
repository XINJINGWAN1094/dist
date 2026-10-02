import webpack from 'webpack';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, '赛琉弥斯角色卡/src/角色卡玩法规则包');
const output = path.join(root, 'dist/角色卡玩法规则包/脚本/变量结构');
const compiler = webpack({
  mode: 'production', target: ['web', 'es2022'], devtool: false,
  entry: path.join(source, '脚本/变量结构/index.ts'),
  experiments: { outputModule: true },
  output: { path: output, filename: 'index.js', module: true, clean: true },
  resolve: { extensions: ['.ts', '.js'] },
  module: { rules: [{ test: /\.ts$/, loader: 'ts-loader', options: {
    transpileOnly: true, onlyCompileBundledFiles: true, configFile: path.join(root, 'tsconfig.json'),
  } }] },
  externals: ({ request }, callback) => {
    if (request?.startsWith('https://')) return callback(null, `module ${request}`);
    if (request === 'zod') return callback(null, 'var z');
    callback();
  },
});
try {
  const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : resolve(result)));
  if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
  const script = { id: '41448591-2b92-459e-bf18-2ed137da78a8', type: 'script', enabled: true,
    name: '赛琉弥斯变量结构·装备接入', content: await readFile(path.join(output, 'index.js'), 'utf8'),
    info: '替换既有玩法变量结构脚本，勿重复注册。保留地图时间同步，新增装备与玩法正文视图；配套替换变量列表和变量更新规则，不重置聊天、不发放示例宝物。',
    button: { enabled: false, buttons: [] }, data: {} };
  await writeFile(path.join(output, '变量结构-装备接入.json'), JSON.stringify(script, null, 2) + '\n');
  const template = JSON.parse(await readFile(new URL('./gameplay-worldbook-entry.json', import.meta.url), 'utf8'));
  const specs = [
    ['[initvar]变量初始化勿开', 'initvar.yaml', true], ['变量列表', '变量列表.txt', false],
    ['[mvu_update]变量更新规则', '变量更新规则.yaml', false], ['[mvu_update]变量输出格式', '变量输出格式.yaml', false],
  ];
  const entries = {};
  for (const [uid, [comment, filename, disable]] of specs.entries()) entries[uid] = {
    ...template, uid, comment, disable, content: (await readFile(path.join(source, '世界书/变量', filename), 'utf8')).trim(),
    order: 14720 + uid, position: uid === 0 ? 0 : 4, depth: 0, displayIndex: uid,
  };
  await writeFile(path.join(output, '角色卡玩法_MVU变量.worldbook.json'), JSON.stringify({ entries }, null, 2) + '\n');
  await writeFile(path.join(output, '接入说明.md'), '# 装备变量接入\n\n用变量结构-装备接入.json 替换原玩法变量结构角色脚本，保留 MVU 框架，只启用一个玩法 schema 注册脚本。\n\n配套世界书仅用于替换“变量列表”“[mvu_update]变量更新规则”两个对应条目。既有聊天不重跑初始化，不覆盖其他世界观条目。\n\n人物与宝物界面在酒馆同源前端环境中连接此脚本；8356 端口的独立预览仍显示示例，不修改真实聊天。\n\n本次源码与导入文件尚未安装到实际酒馆；效果库、消耗秘宝结算和宝物投放仍待定。\n');
  console.log('Built variable script and matching worldbook/import artifacts.');
} finally {
  await new Promise(resolve => compiler.close(resolve));
}
