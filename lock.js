const { map, scan, switchMap, pairwise, takeUntil } = rxjs.operators;
const { fromEvent } = rxjs;

const target = document.getElementById("combo");

const mouseDown = fromEvent(document, "mousedown");
const mouseUp = fromEvent(document, "mouseup");
const mouseMove = fromEvent(document, "mousemove");

var origin = {
  x: 200,
  y: 200
};

/**
 * Calculates the angle (in degrees) from three points.
 */
function calculateAngleDegrees(point1, point2, point3) {
  var point2AtOrigin = {
    x: point2.x - point1.x,
    y: point2.y - point1.y
  };
  var point3AtOrigin = {
    x: point3.x - point1.x,
    y: point3.y - point1.y
  };
  var angleOfPoint2 = Math.atan2(point2AtOrigin.y, point2AtOrigin.x);
  var angleOfPoint3 = Math.atan2(point3AtOrigin.y, point3AtOrigin.x);
  return ((angleOfPoint3 - angleOfPoint2) * 180) / Math.PI;
}

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
  scan((currentRotation, rotationAdjustment) => currentRotation + rotationAdjustment, 0),
  map(newRotation => Math.ceil(newRotation / 9) * 9) // 360 / 40 = 9 degrees per number
);

rotation.subscribe(newRotation => {
  target.setAttribute("transform", `rotate(${newRotation})`);
});
