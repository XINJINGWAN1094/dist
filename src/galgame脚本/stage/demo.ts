import { SCENE_CG_MAP } from '../constants';
import type { DemoScene, StageState } from '../types';

export function buildDemoScenes(): DemoScene[] {
  return [
    {
      bgName: '黄昏站台',
      bgStyle: 'linear-gradient(160deg, rgba(28, 57, 102, 0.78) 0%, rgba(195, 122, 74, 0.42) 38%, rgba(39, 26, 54, 0.84) 100%)',
      leftName: '澪',
      leftPose: '平静',
      rightName: '凛',
      rightPose: '试探',
      speaker: 'left',
      line: '列车还没来，我们先把计划再核对一次。今天不能出错。',
      note: '已切到场景 1：黄昏站台',
    },
    {
      bgName: '雨夜天桥',
      bgStyle: 'linear-gradient(168deg, rgba(12, 34, 56, 0.84) 0%, rgba(41, 92, 124, 0.42) 36%, rgba(9, 17, 30, 0.92) 100%)',
      leftName: '澪',
      leftPose: '紧张',
      rightName: '凛',
      rightPose: '认真',
      speaker: 'right',
      line: '我明白了。你负责引开巡逻，我去取钥匙，三分钟后在桥尾汇合。',
      note: '已切到场景 2：雨夜天桥',
    },
    {
      bgName: '废弃剧场',
      bgStyle: 'linear-gradient(162deg, rgba(54, 26, 64, 0.74) 0%, rgba(148, 56, 47, 0.36) 41%, rgba(20, 16, 33, 0.9) 100%)',
      leftName: '澪',
      leftPose: '坚定',
      rightName: '凛',
      rightPose: '动摇',
      speaker: 'left',
      line: '别看台下，听我的节拍。只要灯光一灭，我们就能离开这里。',
      note: '已切到场景 3：废弃剧场',
    },
  ];
}

export function buildStateFromDemoScene(scene: DemoScene): StageState {
  return {
    bgName: scene.bgName,
    bgStyle: scene.bgStyle,
    bgImageUrl: SCENE_CG_MAP[scene.bgName],
    leftName: scene.leftName,
    leftPose: scene.leftPose,
    rightName: scene.rightName,
    rightPose: scene.rightPose,
    speaker: scene.speaker,
    line: scene.line,
    status: `状态：${scene.note}`,
    lastSyncMessageId: null,
    source: 'demo',
  };
}
