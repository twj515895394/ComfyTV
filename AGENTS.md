# AGENTS.md

二次开发约定。本仓库跟进上游 `main`；本地功能必须能和主线并存，不能靠改主线内部来实现。

## 原则

1. **单一职责。** 一个模块只做一件事。新能力写成独立文件/包，不要塞进已有大文件。
2. **低耦合。** 通过公开注册表、配置表、窄接口接入；不要改调用方内部流程。
3. **插件 / 组件思维。** 二开 = 新增插件或组件 + 最少注册点。禁止在主线实现里摊开业务。
4. **少改主线，少冲突。** 合 `origin/main` 时冲突应只出现在注册表，而不是 700 行流程文件。能加一行注册，就不改上游函数体。

主线迭代快。在 `useStageNode.ts`、`generators.py`、`_workflow_resolve.py` 这类上游文件里直接改逻辑，下次 merge 必撞。H3VideoStage 那次冲突就是这样来的。

## 怎么做

**新增 Stage**

- 新 class 放自己的文件（例如 `nodes/stages/h3_video.py`），不要追加进 `generators.py`。
- 只在 `stage_classes()` / `STAGE_META` / 前端 `GENERATORS` 或 `V2_SHELLS` 登记。
- 解析、分辨率表、option 映射放独立 helper，不要改 `_Resolver` 主体。

**改前端行为**

- 新逻辑进新 composable / `src/v2/` 配置项。
- 禁止把流程写回已拆过的 god-file（`useStageNode.ts`、`stageRun.ts` 等）。主线拆了就跟注册点走。
- V2 皮肤：加配置，不改 `makeGeneratorShell`。

**改 runner / workflow**

- 新绑定、新 option 用独立函数或表。
- 工作流 JSON / preset 放 `workflows/`，不要为了二开去改 runner 控制流。

**测试**

- 新能力用新测试文件。不要把上游契约测试改回旧写法。

## 禁止

- 为了二开去重构、格式化、顺手清理主线代码。
- 复制一份上游函数再改内部（下次合入仍冲突，且会漂）。
- 在主线 `if class == ...` 里堆特殊分支；把差异收进插件配置或独立模块。

## 合主线时

- 合 `origin/main`，不要 force merge / reset --hard。
- 冲突时：**主线结构为底，二开只补注册和自己的文件。**
- 二开 WIP 先 stash，合完再 pop，避免叠第二轮冲突。

判断标准：这个改动能不能做成「新文件 + 一处登记」？能，就不要改主线。
