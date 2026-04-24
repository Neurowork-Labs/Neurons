/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export type ActivePlanOption = {
  id: string;
  name: string;
  index: number;
};

export type ActivePlansApiResult =
  | { ok: true; plans: ActivePlanOption[] }
  | { ok: false; message: string };
