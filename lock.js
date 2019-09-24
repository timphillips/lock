const lock = (() => {
  if (!rxjs) {
    throw new Error("Unable to find global rxjs library.");
  }

  const {
    bufferCount,
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
    withLatestFrom
  } = rxjs.operators;
  const { never, of } = rxjs;

  /**
   * Calculates the angle (in degrees) from two vectors, one from point P1 to P2 and one from P1 to P3.
   * Adapted from https://stackoverflow.com/a/31334882.
   */
  function calculateAngleInDegrees(point1, point2, point3) {
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

  function getNewCombination(tickCount) {
    var combination = [];
    while (combination.length < 3) {
      const number = Math.floor(Math.random() * tickCount);
      // skip duplicate numbers and don't start with 0
      if (combination.indexOf(number) === -1 && !(combination.length === 0 && number === 0)) {
        combination.push(number);
      }
    }
    return combination;
  }

  /**
   * Returns an observable that emits the current rotation of the lock's spinner
   * element in the DOM, which is computed based on the given mouse drag events.
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
              x: previousMouseMove.x,
              y: previousMouseMove.y
            };
            const point2 = {
              x: nextMouseMove.x,
              y: nextMouseMove.y
            };
            return calculateAngleInDegrees(origin, point1, point2);
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
   * @param tickCount Number of ticks in this combination lock.
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
        // If the lock is rotated very quickly then the lock may rotate through
        // multiple numbers in one frame. However, this number stream should
        // emit *every* number that the lock is rotated through (this is needed,
        // for example, to ensure that rotating past 0 is detected when resetting
        // the lock). This extra bit of code adds the extra numbers that might
        // have been missed. For example, if rotating clockwise:
        // - Previous rotation: 342
        // - Next rotation: 27
        // - Previous number: 342 / 360 * 40 = 38
        // - Next number: 27 / 360 * 40 = 3
        // - So, rather than emitting 3 directly after 38, we make sure that this
        //   stream emits [39, 0, 1, 2, 3]
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
   * Returns an observable that emits "clockwise" or "counterclockwise" when the
   * rotation direction changes.
   *
   * @param numberStream Observable emitting the number that the dial is pointing to.
   * @param tickCount Number of ticks in this combination lock.
   */
  function createDirectionStream(numberStream, tickCount) {
    return numberStream.pipe(
      pairwise(),
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
   * This detects when the lock is rotated clockwise past 0 three times.
   *
   * @param numberStream Observable emitting the number that the dial is pointing to.
   * @param directionStream Observable emitting "clockwise" or "counterclockwise" when the rotation direction changes.
   */
  function createResetStream(numberStream, directionStream) {
    return directionStream.pipe(
      filter(direction => direction === "clockwise"), // reset will only happen when rotating clockwise
      switchMap(() =>
        numberStream.pipe(
          filter(number => number === 0),
          bufferCount(3),
          mapTo(true)
        )
      ),
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
    const unlockStream = resetStream.pipe(
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
          debounceTime(250), // require actually stopping at the last number
          filter(number => number === combination[2])
        )
      ),
      mapTo(true)
    );

    // when the lock is unlocked, start listening for the next number so that
    // the lock is re-locked
    var unlockStreamWithReset = unlockStream.pipe(
      filter(isUnlocked => isUnlocked),
      switchMap(() =>
        numberStream.pipe(
          // after being unlocked, any subsequent event from the number stream
          // should switch back to a locked state ("false")
          mapTo(false),
          startWith(true),
          take(2) // only listen until the lock is re-locked ("true" and then "false")
        )
      ),
      startWith(false)
    );

    return unlockStreamWithReset;
  }

  return {
    createDirectionStream,
    createNumberStream,
    createResetStream,
    createRotationStream,
    createUnlockedStream,
    getNewCombination
  };
})();
