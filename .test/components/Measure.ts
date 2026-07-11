import { Measure, useEarth } from '../../src';

export const testMeasure = () => {
  const measure = new Measure(useEarth());
  // useEarth().useMeasure().lineSegmentation({
  //   pointColor: "red",
  //   callback: () => {
  //     // console.log(e)
  //     // setTimeout(() => {
  //     //   useEarth().useMeasure().clear();
  //     // }, 3000)
  //   }
  // });
  // useEarth().useMeasure().lineCenter({
  //   callback: (e) => {
  //     console.log(e)
  //   }
  // });
  // useEarth().useMeasure().polygonMeasure({
  //   pointColor: "red",
  //   callback: (e) => {
  //     console.log(e)
  //   }
  // });
  return () => measure.clear();
};
