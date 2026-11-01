// 可以直接顯示給使用者看的錯誤訊息
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}
