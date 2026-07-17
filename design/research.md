# GitHub UI 与产品模式研究

## 参考来源

- Rainbow Cats：<https://github.com/UxxHans/Rainbow-Cats-Personal-WeChat-MiniProgram>
- Orange Nan：<https://github.com/inannan423/orange-nan-mini_program>
- Our Nest：<https://github.com/rick-ben/our-nest>
- Love Diary：<https://github.com/xuewen-1/love-diary>
- TDesign MiniProgram：<https://github.com/Tencent/tdesign-miniprogram>
- WeUI MiniProgram：<https://github.com/wechat-miniprogram/weui-miniprogram>

## 约定：用户已经形成的预期

- 首页先回答“我们现在怎么样”，再给快捷动作；
- 情侣头像/身份、在一起天数、最近共同内容位于首屏；
- 纪念日使用倒计时，任务和奖励使用明确状态；
- 相册使用封面网格，记录使用时间线或动态流；
- 创建动作靠近底部或列表末端，并始终给出加载、空、失败反馈；
- 主导航控制在 4 个入口，其余能力进入功能中心。

## 对标项目

### Rainbow Cats

- 可取：任务确认、积分商城、仓库、预设、订阅提醒形成强互动闭环；
- UI 模式：轮播图、分组卡片、滑动操作；
- 避免：硬编码情侣身份、过小字号、内联样式、Emoji 作为主要视觉系统。

### Orange Nan

- 可取：首屏恋爱时长、纪念日倒计时、记事本入口；
- UI 模式：大图封面、粉色胶囊数字、圆角入口卡；
- 避免：绝对定位、固定像素、单一粉色和超大图片挤压有效信息。

### Our Nest

- 可取：情侣头像对称布局、动态流、公共导航/成员选择组件、暗色主题；
- UI 模式：人物—关系—内容的清晰层级；
- 避免：将动态流变成公开社交产品；GPL-2.0 代码只参考设计，不直接复制。

### Love Diary

- 可取：首页数据总览、快捷入口、纪念日卡、留言板、文件导入导出；
- UI 模式：模块化首页和明确空状态；
- 避免：粉色渐变、过量 Emoji、本地手工同步；未明确许可证，只参考思路。

### TDesign / WeUI

- 可取：一致的按钮、弹窗、加载、表单、空状态、可访问反馈和组件测试；
- 使用策略：保留 Lovetry 自有视觉，只借鉴状态规范和交互尺寸，不同时全量引入两套组件库。

## 痛点

- 同类项目普遍将“情侣感”等同于粉色、爱心和插画，易幼稚且辨识度低；
- 共享与私密状态常依赖小字说明，存在误分享风险；
- 页面堆功能入口，但缺乏主导航和任务优先级；
- 多数项目缺少弱网、冲突、幂等、恢复和自动测试；
- 动态与提醒功能常直接绑定 OpenID，难以部署给其他情侣。

## 可利用空白

- 以“双轨”表达两个人，而不是以爱心表达情侣；
- 共享内容显示双轨汇合，私密内容仅显示一条本人轨道；
- 把提醒、回应、兑换做成克制的关系动作，不做排行和监控；
- 通过冷静的年鉴排版承载长期记录，避免一次性模板感；
- 工程层保留事务、权限、幂等、备份和自动测试优势。

## P8 高频录入体验复查（2026-07-18）

### 新证据

- Rainbow Cats 把任务/商品“预设”作为快速新增能力，同时保留搜索、明确时间记录和状态动作；适合借鉴其减少重复输入的方式，不复制硬编码身份与旧式滑动操作：<https://github.com/UxxHans/Rainbow-Cats-Personal-WeChat-MiniProgram>；
- Love Diary 用 `wx.setStorageSync` / `wx.getStorageSync` 保存日记、心情等本地数据，证明原生小程序本机恢复路径足够轻量；但其全部数据只在本机、需要手动同步，本项目只将它用于未提交草稿，正式数据仍以 CloudBase 为准：<https://github.com/xuewen-1/love-diary>；
- Our Nest 将动态、相册和纪念日集中在情侣空间，并采用 WeUI 保持原生反馈一致；本项目继续保留自有视觉，仅吸收清晰状态与创建入口：<https://github.com/rick-ben/our-nest>；
- TDesign MiniProgram 提供成体系的表单、日历、上传和状态组件，说明高频表单需要一致的加载、空、失败和触控规范：<https://github.com/Tencent/tdesign-miniprogram>；
- Super Productivity 把任务、时间盒和专注记录串成连续工作流；本项目对应地保留任务—日历—番茄钟关联：<https://github.com/super-productivity/super-productivity>。

### 本轮采用

- 所有记录类型和计划类型按类型隔离本机草稿，7 天后自动失效；
- 页面明确显示“正在保留/已保存/已恢复”，不让本地持久化成为隐藏行为；
- 提供克制的结构化模板，填入后可自由修改，不替用户制造真实内容；
- 日历空日期直接创建当天记录或事件，减少返回首页再选择日期的路径；
- 奖励金额提供常用档位，同时保留自由输入。

### 明确不采用

- 不把正式业务数据降级为仅本地存储；
- 不复制 GPL 项目代码；
- 不引入整套 TDesign/WeUI，避免包体和视觉冲突；
- 不使用粉色爱心、表情堆叠或隐藏手势作为主要交互。
