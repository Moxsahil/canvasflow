export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const IDENTITy_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
};
