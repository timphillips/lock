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
  take,
  takeUntil,
  tap,
  withLatestFrom
} = rxjs.operators;
const { fromEvent, never, of } = rxjs;

/**
 * Calculates the angle (in degrees) from two vectors, one from point P1 to P2 and one from P1 to P3.
 * Adapted from https://stackoverflow.com/a/31334882.
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
 * @param getOriginCoordinates Function that gets the origin coordinates of the spinner element in the DOM.
 * @param mouseDownStream Observable emitting mouse down events.
 * @param mouseUpStream Observable emitting mouse up events.
 * @param mouseMoveStream Observable emitting mouse move events.
 * @param tickCount Number of ticks in this combination lock.
 */
function createRotationStream(getOriginCoordinates, mouseDownStream, mouseUpStream, mouseMoveStream, tickCount) {
  const degreesPerTick = 360 / tickCount;

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
    map(newRotation => Math.ceil(newRotation / degreesPerTick) * degreesPerTick),
    distinctUntilChanged()
  );
}

/**
 * Returns an observable that emits the number that the lock's dial is pointing to.
 *
 * @param rotationStream Observable emitting the current rotation transformation of the lock element in the DOM.
 * @param tickCount Number of ticks in this combination lock (typically 40).
 */
function createNumberStream(rotationStream, tickCount) {
  return rotationStream.pipe(
    startWith(0),
    map(rotation => {
      const number = Math.abs(rotation / (360 / tickCount));
      return rotation > 0 ? tickCount - number : number;
    }),
    pairwise(),
    switchMap(([previous, next]) => {
      const numbersBetweenIfCounterclockwise = Math.min(
        ...[next - previous, next - previous + tickCount, tickCount].filter(num => num >= 0)
      );
      const numbersBetweenIfClockwise = Math.min(
        ...[previous - next, previous - next + tickCount, tickCount].filter(num => num >= 0)
      );

      const output = [];
      if (numbersBetweenIfCounterclockwise < numbersBetweenIfClockwise) {
        while (previous != next) {
          if (previous === tickCount - 1) {
            previous = -1;
          }
          output.push(++previous);
        }
      } else {
        while (previous != next) {
          if (previous === 0) {
            previous = tickCount;
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
 * @param numberStream Observable emitting the number that the dial is pointing to.
 * @param tickCount Number of ticks in this combination lock (typically 40).
 */
function createDirectionStream(numberStream, tickCount) {
  return numberStream.pipe(
    pairwise(),
    filter(([previous, next]) => previous !== next),
    map(([previous, next]) => {
      if (previous === tickCount - 1 && next === 0) {
        return "counterclockwise";
      }
      if (previous === 0 && next === tickCount - 1) {
        return "clockwise";
      }
      return next >= previous ? "counterclockwise" : "clockwise";
    }),
    distinctUntilChanged()
  );
}

/**
 * Returns an observable that emits when the lock is reset.
 *
 * @param numberStream Observable emitting the number that the dial is pointing to.
 * @param directionStream Observable emitting "clockwise" or "counterclockwise" when the rotation direction changes.
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
 * @param resetStream Observable emitting when the lock is reset.
 * @param numberStream Observable emitting the number that the dial is pointing to.
 * @param directionStream Observable emitting "clockwise" or "counterclockwise" when the rotation direction changes.
 * @param combination Solution for the combination lock as an array of three numbers.
 */
function createUnlockedStream(resetStream, numberStream, directionStream, combination) {
  // after reset event...
  return resetStream.pipe(
    switchMap(() =>
      // ...emit when rotation direction switches to counterclockwise after correct first number...
      directionStream.pipe(
        withLatestFrom(numberStream.pipe(pairwise())),
        filter(
          ([direction, [previousNumber]]) => direction === "counterclockwise" && previousNumber === combination[0]
        ),
        // ...then emit when counterclockwise rotation continues past first number...
        switchMap(() =>
          numberStream.pipe(
            filter(number => number === combination[0]),
            take(1)
          )
        )
      )
    ),
    // ...then emit when rotation direction switches to clockwise after correct second number...
    switchMap(() =>
      directionStream.pipe(
        withLatestFrom(numberStream.pipe(pairwise())),
        filter(([direction, [previousNumber]]) => direction === "clockwise" && previousNumber === combination[1])
      )
    ),
    // ...then emit when counterclockwise rotation continues to the third number...unlocked!
    switchMap(() =>
      numberStream.pipe(
        debounceTime(100),
        filter(number => number === combination[2])
      )
    ),
    mapTo(true),
    startWith(false)
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
  const tickCount = 40;

  const bodyElement = document.getElementById("body");
  const handleElement = document.getElementById("lock-handle");
  const spinnerElement = document.getElementById("lock-spinner");
  const solutionElement = document.getElementById("meta-solution");

  const combination = getNewCombination();
  solutionElement.innerHTML = combination.join(" • ");

  const handleClickStream = fromEvent(handleElement, "click");
  const mouseDownStream = fromEvent(document, "mousedown");
  const mouseUpStream = fromEvent(document, "mouseup");
  const mouseMoveStream = fromEvent(document, "mousemove");

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
    tickCount
  );
  const numberStream = createNumberStream(rotationStream, tickCount);
  const directionStream = createDirectionStream(numberStream, tickCount);
  const resetStream = createResetStream(numberStream, directionStream);
  const unlockedStream = createUnlockedStream(resetStream, numberStream, directionStream, combination);

  handleElement.addEventListener(
    "webkitAnimationEnd",
    function(e) {
      handleElement.classList.remove("lock-handle--closed");
      handleElement.classList.remove("lock-handle--open");
    },
    false
  );
  handleClickStream.pipe(withLatestFrom(unlockedStream)).subscribe(([_, unlocked]) => {
    if (unlocked) {
      handleElement.classList.add("lock-handle--open");
      bodyElement.classList.add("unlocked");
    } else {
      handleElement.classList.add("lock-handle--closed");
    }
  });

  rotationStream.subscribe(newRotation => {
    spinnerElement.setAttribute("transform", `rotate(${newRotation})`);
  });

  // debug output
  numberStream.subscribe(number => console.log("Number", number));
  directionStream.subscribe(direction => console.log("Direction", direction));
  resetStream.subscribe(() => console.log("Reset"));
  unlockedStream.subscribe(unlocked => {
    if (unlocked) {
      console.log("Unlock");
    }
  });
}

// Here we go!
initializeCombinationLock();
