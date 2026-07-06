# 通用视频课学习辅助脚本

独立工具，不接入 Tavern Helper 构建。它只做真实播放辅助：正常倍速播放，网页视频自然结束后才进入下一节；验证码、测验、人脸、弹窗等情况会暂停提醒。

## 最简安装：网页课程

1. 先安装浏览器插件 Tampermonkey。
2. 双击运行 `install-web-helper.bat`。
3. 浏览器会打开油猴安装页，点安装。
4. 打开课程网页，点油猴菜单里的 `Video Course Helper: show panel`。
5. 面板里点 `Add current page` 把当前课程加入队列，再点 `Start`。

这样不需要复制脚本内容，也不需要一开始就写 JSON。

## 批量导入课程

如果你已经写好了 `course-queue.json`：

1. 打开课程网页。
2. 显示 `Video Course Helper` 面板。
3. 点 `Import file`。
4. 选择本目录里的 `course-queue.json`。
5. 点 `Start`。

也可以点 `Import JSON` 手动粘贴 JSON；点 `Export JSON` 可以导出现有队列。

## 自动提取目录

如果课程目录页有固定结构，先在 `course-queue.json` 的 `settings.selectors` 里填：

```json
{
  "catalogItem": ".lesson-item",
  "catalogTitle": ".lesson-title",
  "catalogUrl": "a"
}
```

然后在课程目录页点 `Extract catalog`。识别失败不会覆盖你手填的章节。

## 桌面软件课程

1. 安装 AutoHotkey v2。
2. 打开课程软件。
3. 双击运行 `list-windows.ahk`，选中课程软件窗口，点 `Copy selected config`。
4. 把复制出的配置块放进 `course-queue.json` 的 `chapters` 数组里。
5. 双击运行 `video-course-helper.ahk`。
6. 点 `Load queue`，再点 `Start`。

软件端无法像网页一样可靠监听视频自然结束，所以 `durationSeconds` 到点后会弹窗让你确认。

学习通建议优先使用网页版课程页面，再用油猴脚本；如果必须用电脑客户端，就按上面的 `list-windows.ahk` 流程抓窗口标题和启动路径。

## 配置示例

网页章节：

```json
{
  "id": "web-001",
  "title": "第一节",
  "type": "web",
  "url": "https://example.com/course/lesson-1",
  "selectors": {
    "video": "video"
  }
}
```

软件章节：

```json
{
  "id": "app-001",
  "title": "客户端第一节",
  "type": "app",
  "appLaunch": "C:\\Path\\To\\CourseApp.exe",
  "windowTitle": "Course App",
  "hotkeys": {
    "playPause": "{Space}",
    "next": "^n"
  },
  "click": {
    "x": 960,
    "y": 540
  },
  "durationSeconds": 1800
}
```

完整参考见 `course-queue.example.json`。

## 边界

- 不伪造观看进度。
- 不自动答题。
- 不处理验证码或人脸。
- 不绕过防挂机。
- 只在真实播放结束或人工确认后推进。
