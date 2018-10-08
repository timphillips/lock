const {
  bufferCount,
  combineLatest,
  distinctUntilChanged,
  filter,
  flatMap,
  map,
  pairwise,
  scan,
  startWith,
  switchMap,
  takeUntil,
  tap,
  share
} = rxjs.operators;
const { fromEvent, interval, of, never } = rxjs;

const mouseDown = fromEvent(document, "mousedown");
const mouseUp = fromEvent(document, "mouseup");
const mouseMove = fromEvent(document, "mousemove");

/**
 * Calculates the angle (in degrees) from three points.
 */
function calculateAngleDegrees(point1, point2, point3) {
  const point2AtOrigin = {
    x: point2.x - point1.x,
    y: point2.y - point1.y
  };
  const point3AtOrigin = {
    x: point3.x - point1.x,
    y: point3.y - point1.y
  };
  const angleOfPoint2 = Math.atan2(point2AtOrigin.y, point2AtOrigin.x);
  const angleOfPoint3 = Math.atan2(point3AtOrigin.y, point3AtOrigin.x);
  return ((angleOfPoint3 - angleOfPoint2) * 180) / Math.PI;
}

const numberOfTicks = 40;
const degreesPerTick = 360 / numberOfTicks;
const origin = {
  x: 200,
  y: 200
};

const rotation = mouseDown.pipe(
  switchMap(() =>
    mouseMove.pipe(
      pairwise(),
      map(([previousMouseMove, nextMouseMove]) => {
        var point1 = {
          x: previousMouseMove.clientX,
          y: previousMouseMove.clientY
        };
        var point2 = {
          x: nextMouseMove.clientX,
          y: nextMouseMove.clientY
        };
        return calculateAngleDegrees(origin, point1, point2);
      }),
      takeUntil(mouseUp)
    )
  ),
  scan((currentRotation, rotationAdjustment) => {
    const newRotation = currentRotation + rotationAdjustment;
    if (newRotation >= 360) {
      return newRotation - 360;
    }
    if (newRotation <= -360) {
      return newRotation + 360;
    }
    return newRotation;
  }, 0),
  map(newRotation => Math.ceil(newRotation / degreesPerTick) * degreesPerTick),
  distinctUntilChanged()
);

const number = rotation.pipe(
  startWith(0),
  map(rotation => {
    const number = Math.abs(rotation / degreesPerTick);
    return rotation > 0 ? numberOfTicks - number : number;
  }),
  pairwise(),
  switchMap(([previous, next]) => {
    const ticksBetweenIfCounterclockwise = Math.min(
      ...[next - previous, next - previous + numberOfTicks, numberOfTicks].filter(num => num >= 0)
    );
    const ticksBetweenIfClockwise = Math.min(
      ...[previous - next, previous - next + numberOfTicks, numberOfTicks].filter(num => num >= 0)
    );

    const output = [];
    if (ticksBetweenIfCounterclockwise < ticksBetweenIfClockwise) {
      while (previous != next) {
        if (previous === numberOfTicks - 1) {
          previous = -1;
        }
        output.push(++previous);
      }
    } else {
      while (previous != next) {
        if (previous === 0) {
          previous = numberOfTicks;
        }
        output.push(--previous);
      }
    }
    return of(...output);
  }),
  share()
);

number.subscribe();

const direction = number.pipe(
  pairwise(),
  map(([previousNumber, nextNumber]) => {
    if (previousNumber === nextNumber) {
      return undefined;
    }
    if (previousNumber === 39 && nextNumber === 0) {
      return "counterclockwise";
    }
    if (previousNumber === 0 && nextNumber === 39) {
      return "clockwise";
    }
    return nextNumber >= previousNumber ? "counterclockwise" : "clockwise";
  }),
  filter(value => value !== undefined),
  distinctUntilChanged()
);

const reset = direction
  .pipe(
    switchMap(dir => {
      if (dir === "clockwise") {
        return number.pipe(
          filter(number => number === 0),
          tap(value => console.log("test 3")),
          bufferCount(3)
        );
      }
      return never();
    })
  )
  .subscribe(console.log);

const target = document.getElementById("combo");

rotation.subscribe(newRotation => {
  target.setAttribute("transform", `rotate(${newRotation})`);
});
