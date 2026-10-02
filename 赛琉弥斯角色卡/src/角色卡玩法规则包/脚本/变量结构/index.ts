import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';
import { installMapTimeBridge } from './map-time';
import { installEquipmentRuntime } from './equipment-runtime';

$(() => {
  (async () => {
    await waitGlobalInitialized('Mvu');
    registerMvuSchema(Schema);
    installMapTimeBridge();
    installEquipmentRuntime();
  })().catch(error => console.error('[角色卡玩法] MVU 变量结构注册失败', error));
});
