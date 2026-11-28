import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';

export default class WorkbenchAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    try {
      stage.loadContent('pages/Workbench').catch((error: BusinessError) => {
        console.error('加载工作台页面失败', error);
      });
    } catch (error) {
      console.error('加载工作台页面失败', error);
    }
  }
}
