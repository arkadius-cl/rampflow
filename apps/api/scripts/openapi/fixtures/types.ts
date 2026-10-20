// Stands in for packages/shared/src/modules/<id>/api*.ts in static.test.ts.

export interface ThingView {
  id: string;
  name: string;
  createdAt: Date;
}

export interface CountView {
  count: number;
}
