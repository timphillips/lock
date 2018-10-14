const {
  bufferCount,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  mapTo,
  pairwise,
  scan,
  share,
  startWith,
  switchMap,
  takeUntil,
  withLatestFrom
} = rxjs.operators;
const { fromEvent, never, of } = rxjs;

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

/**
 * Returns an observable that emits the current rotation of the lock's spinner element in the DOM.
 * Computed based on the given mouse drag events.
 *
 * @param mouseDownStream - Observable emitting mouse down events.
 * @param mouseUpStream - Observable emitting mouse up events.
 * @param mouseMoveStream - Observable emitting mouse move events.
 * @param numberCount - Number of ticks in this combination lock (typically 40).
 */
function createRotationStream(getOriginCoordinates, mouseDownStream, mouseUpStream, mouseMoveStream, numberCount) {
  const degreesPerNumber = 360 / numberCount;

  return mouseDownStream.pipe(
    switchMap(() =>
      mouseMoveStream.pipe(
        pairwise(),
        map(([previousMouseMove, nextMouseMove]) => {
          const origin = getOriginCoordinates();
          const point1 = {
            x: previousMouseMove.clientX,
            y: previousMouseMove.clientY
          };
          const point2 = {
            x: nextMouseMove.clientX,
            y: nextMouseMove.clientY
          };
          return calculateAngleDegrees(origin, point1, point2);
        }),
        takeUntil(mouseUpStream)
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
    map(newRotation => Math.ceil(newRotation / degreesPerNumber) * degreesPerNumber),
    distinctUntilChanged()
  );
}

/**
 * Returns an observable that emits the number that the lock's dial is pointing at.
 *
 * @param rotationStream - Observable emitting the current rotation transformation of the lock element in the DOM.
 * @param numberCount - Number of ticks in this combination lock (typically 40).
 */
function createNumberStream(rotationStream, numberCount) {
  return rotationStream.pipe(
    startWith(0),
    map(rotation => {
      const number = Math.abs(rotation / (360 / numberCount));
      return rotation > 0 ? numberCount - number : number;
    }),
    pairwise(),
    switchMap(([previous, next]) => {
      const numbersBetweenIfCounterclockwise = Math.min(
        ...[next - previous, next - previous + numberCount, numberCount].filter(num => num >= 0)
      );
      const numbersBetweenIfClockwise = Math.min(
        ...[previous - next, previous - next + numberCount, numberCount].filter(num => num >= 0)
      );

      const output = [];
      if (numbersBetweenIfCounterclockwise < numbersBetweenIfClockwise) {
        while (previous != next) {
          if (previous === numberCount - 1) {
            previous = -1;
          }
          output.push(++previous);
        }
      } else {
        while (previous != next) {
          if (previous === 0) {
            previous = numberCount;
          }
          output.push(--previous);
        }
      }
      return of(...output);
    }),
    share()
  );
}

/**
 * Returns an observable that emits "clockwise" or "counterclockwise" when the rotation direction changes.
 *
 * @param numberStream - Observable emitting the lock's current number.
 * @param numberCount - Number of ticks in this combination lock (typically 40).
 */
function createDirectionStream(numberStream, numberCount) {
  return numberStream.pipe(
    pairwise(),
    map(([previous, next]) => {
      if (previous === next) {
        return undefined;
      }
      if (previous === numberCount - 1 && next === 0) {
        return "counterclockwise";
      }
      if (previous === 0 && next === numberCount - 1) {
        return "clockwise";
      }
      return next >= previous ? "counterclockwise" : "clockwise";
    }),
    filter(value => value !== undefined),
    distinctUntilChanged()
  );
}

/**
 * Returns an observable that emits when the lock is reset.
 *
 * @param numberStream - Observable emitting the lock's current number.
 * @param directionStream - Observable emitting "clockwise" or "counterclockwise" when the rotation direction changes.
 */
function createResetStream(numberStream, directionStream) {
  return directionStream.pipe(
    switchMap(direction => {
      if (direction === "clockwise") {
        // when rotating clockwise, wait to see 0 three times
        return numberStream.pipe(
          filter(number => number === 0),
          bufferCount(3),
          mapTo(true)
        );
      }
      return never(); // reset will never happen when rotating counterclockwise
    }),
    startWith(true)
  );
}

/**
 * Returns an observable that emits when the lock is unlocked.
 *
 * @param resetStream - Observable emitting when the lock is reset.
 * @param numberStream - Observable emitting the lock's current number.
 * @param directionStream - Observable emitting "clockwise" or "counterclockwise" when the rotation direction changes.
 * @param combination - Solution for the combination lock as an array of three numbers.
 */
function createUnlockStream(resetStream, numberStream, directionStream, combination) {
  return resetStream.pipe(
    switchMap(() =>
      directionStream.pipe(
        withLatestFrom(numberStream.pipe(pairwise())),
        filter(([direction, [previousNumber]]) => direction === "counterclockwise" && previousNumber === combination[0])
      )
    ),
    switchMap(() =>
      directionStream.pipe(
        withLatestFrom(numberStream.pipe(pairwise())),
        filter(([direction, [previousNumber]]) => direction === "clockwise" && previousNumber === combination[1])
      )
    ),
    switchMap(() =>
      numberStream.pipe(
        debounceTime(100),
        filter(number => number === combination[2])
      )
    )
  );
}

function getNewCombination() {
  var combination = [];
  while (combination.length < 3) {
    const number = Math.floor(Math.random() * 40);
    if (combination.indexOf(number) === -1 && !(combination.length === 0 && number === 0)) {
      combination.push(number);
    }
  }
  return combination;
}

function initializeCombinationLock() {
  const numberCount = 40;
  const combination = getNewCombination();

  const solutionElement = document.getElementById("meta-solution");
  solutionElement.innerHTML = combination.join(" - ");

  const mouseDownStream = fromEvent(document, "mousedown");
  const mouseUpStream = fromEvent(document, "mouseup");
  const mouseMoveStream = fromEvent(document, "mousemove");

  const spinnerElement = document.getElementById("lock-spinner");
  const getOriginCoordinates = () => {
    const bounding = spinnerElement.getBoundingClientRect();
    return {
      x: bounding.x + bounding.width / 2,
      y: bounding.y + bounding.height / 2
    };
  };

  const rotationStream = createRotationStream(
    getOriginCoordinates,
    mouseDownStream,
    mouseUpStream,
    mouseMoveStream,
    numberCount
  );
  const numberStream = createNumberStream(rotationStream, numberCount);
  const directionStream = createDirectionStream(numberStream, numberCount);
  const resetStream = createResetStream(numberStream, directionStream);
  const unlockStream = createUnlockStream(resetStream, numberStream, directionStream, combination);

  rotationStream.subscribe(newRotation => {
    spinnerElement.setAttribute("transform", `rotate(${newRotation})`);
  });

  // debug output
  numberStream.subscribe(number => console.log("Number", number));
  directionStream.subscribe(direction => console.log("Direction", direction));
  resetStream.subscribe(() => console.log("Reset"));
  unlockStream.subscribe(() => console.log("Unlock"));
}

// Here we go!
initializeCombinationLock();
